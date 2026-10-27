"""DeepSeek 对话通道：只负责生成，上下文由路由层组装。

设计取舍：
- 不引入 openai SDK，直接用已在依赖里的 httpx —— 少一个依赖，行为也更透明。
- 系统提示**逐字固定**：DeepSeek 的上下文缓存按前缀命中，固定前缀能把输入价压到 1/30。
  任何动态内容（时间、遥测、告警）都必须放进 user 消息，不要混进 system。
- `deepseek-flash` 默认开启思考：同一问题实测 3569ms / 436 token，关掉后 1402ms / 151 token，
  质量差异可以忽略。因此对话模型显式关闭 thinking；只有走 `reason` 分支时才保留。
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from .config import settings

log = logging.getLogger("iot.llm")

# 这段文本一旦改动，前缀缓存全部失效，改之前先想清楚值不值。
# 也直接决定每次调用的固定成本：这段约 170 字 / 110 token，是单次开销的下限。
SYSTEM_PROMPT = """你是平安区时空物联网平台的态势助手，服务值班长。

规则：
1. 先一句话给判断，再列 2–3 条依据或建议，全文不超过 120 字。
2. 只用「当前态势」里的事实；没给的数据说"当前数据未覆盖"，不许推测或编造数字。
3. 处置按"先报告、再监测、后处置"的顺序说，不写人名、电话或文号。
4. 你只能读数据，不能执行写操作；被要求下发指令时，说明需值班长在对应模块人工确认。
5. 中文，不寒暄，不复述问题，不用 Markdown 标题。"""


class LLMUnavailable(RuntimeError):
    """未启用、无密钥或上游失败。调用方应回落到前端规则引擎，而不是把错误抛给用户。"""


def _chat_payload(query: str, context_block: str, *, reason: bool) -> dict[str, Any]:
    model = settings.llm_model_reason if reason else settings.llm_model_chat
    user_content = f"【当前态势】\n{context_block}\n\n【问题】\n{query}"
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": settings.llm_max_tokens_reason if reason else settings.llm_max_tokens,
        "temperature": 0.3,
        "stream": False,
    }
    if not reason:
        # 关掉思考:快 2.5 倍、省 3 倍;推理分支保留默认行为
        payload["thinking"] = {"type": "disabled"}
    return payload


async def chat(query: str, context_block: str, *, reason: bool = False) -> dict[str, Any]:
    """调用云端模型。失败一律抛 LLMUnavailable，由上层决定是否回落。"""
    if not settings.llm_enabled:
        raise LLMUnavailable("llm disabled")
    if not settings.llm_api_key:
        raise LLMUnavailable("llm api key missing")

    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    payload = _chat_payload(query, context_block, reason=reason)

    started = time.perf_counter()
    last_error: str = ""
    # 分档超时：连接慢就早点放弃，读超时给足模型生成时间。
    # 关键约束——最坏耗时必须小于前端 copilotChat 的 30s 预算，否则用户等到的
    # 是前端 abort 后静默回落的规则引擎答案，还顶着"云端推理"的署名。
    timeout = httpx.Timeout(connect=3.0, read=settings.llm_timeout_seconds, write=5.0, pool=2.0)

    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as exc:
            # 只有连不上才重试；这类失败通常几十毫秒就返回
            last_error = f"{type(exc).__name__}: {exc}"
            log.warning("llm connect error (attempt %s): %s", attempt, last_error)
            continue
        except httpx.HTTPError as exc:
            # 读超时不重试：已经等满一个 read 周期，再等一次只会让前端先断线
            last_error = f"{type(exc).__name__}: {exc}"
            log.warning("llm read timeout, no retry: %s", last_error)
            break

        if resp.status_code == 200:
            try:
                data = resp.json()
            except ValueError:
                # 上游或中间代理返回 200 + HTML 时会走到这里，不能让它变成 500
                last_error = "invalid json payload"
                log.warning("llm returned non-json body")
                break
            if not isinstance(data, dict):
                last_error = "unexpected payload shape"
                break
            choices = data.get("choices") or [{}]
            if not isinstance(choices, list) or not isinstance(choices[0], dict):
                last_error = "unexpected choices shape"
                break
            message = choices[0].get("message") or {}
            if not isinstance(message, dict):
                last_error = "unexpected message shape"
                break
            text = message.get("content") or ""
            if not isinstance(text, str):
                last_error = "unexpected content shape"
                break
            if not text.strip():
                # 推理 token 吃光了 max_tokens 时会走到这里，属于可恢复的上游问题
                last_error = "empty completion"
                log.warning("llm returned empty content (attempt %s)", attempt)
                continue
            return {
                "text": text.strip(),
                "model": data.get("model") or payload["model"],
                "usage": data.get("usage") or {},
                "latencyMs": int((time.perf_counter() - started) * 1000),
            }

        last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
        log.warning("llm upstream error (attempt %s): %s", attempt, last_error)
        if resp.status_code < 500 and resp.status_code != 429:
            break

    raise LLMUnavailable(last_error or "llm unavailable")


def describe() -> dict[str, Any]:
    """给 /api/health 与前端用的通道状态，不泄露密钥。"""
    configured = bool(settings.llm_api_key)
    return {
        "enabled": settings.llm_enabled,
        "configured": configured,
        "model": settings.llm_model_chat,
        "reasonModel": settings.llm_model_reason,
        "available": settings.llm_enabled and configured,
    }
