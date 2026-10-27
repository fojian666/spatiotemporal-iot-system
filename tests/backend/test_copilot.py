import hashlib
from unittest.mock import AsyncMock

import httpx
import pytest

from app import copilot, llm
from app.config import settings
from app.telemetry import TelemetryService


def test_context_prioritizes_abnormal_fourth_metric():
    device = {'metrics': [dict(key=f'm{i}', label=f'metric{i}', warn=10, crit=20) for i in range(4)]}
    text = copilot._metric_text(device, {'m0': 1, 'm1': 2, 'm2': 3, 'm3': 30})
    assert 'metric3 30' in text and '超阈值' in text
    assert 'metric2' not in text


def test_context_focus_and_budget():
    snapshot = TelemetryService().snapshot()
    for query in ['水位超警戒怎么处置', '知识图谱与智慧水务', 'x' * 300]:
        context = copilot.build_context(query, snapshot, scenario='storm', focus_device='WQ-04')
        assert 'WQ-04' in context
        assert len(context) <= copilot.MAX_CONTEXT_CHARS
    # Force truncation without depending on today's small catalog.
    snapshot['server_time'] = 'x' * 1500
    assert len(copilot.build_context('水务', snapshot)) <= copilot.MAX_CONTEXT_CHARS


def test_fixed_prompt_and_disabled_thinking():
    # Deliberate golden fingerprint: changing the cache prefix must be an explicit decision.
    assert hashlib.sha256(llm.SYSTEM_PROMPT.encode()).hexdigest() == 'fc3399412f02f3cf6caa812b0efc9e440bfa653aabab2c5368193f66de43ab76'
    normal = llm._chat_payload('question', 'context', reason=False)
    reason = llm._chat_payload('question', 'context', reason=True)
    assert normal['thinking'] == {'type': 'disabled'}
    assert normal['max_tokens'] >= 150
    assert 'thinking' not in reason
    assert normal['messages'][0] == reason['messages'][0]
    assert 'context' not in normal['messages'][0]['content']


@pytest.fixture
def upstream(monkeypatch):
    monkeypatch.setattr(settings, 'llm_enabled', True)
    monkeypatch.setattr(settings, 'llm_api_key', 'test-only-key')
    post = AsyncMock()
    client = AsyncMock()
    client.__aenter__.return_value.post = post
    monkeypatch.setattr(llm.httpx, 'AsyncClient', lambda **kwargs: client)
    return post


async def test_cloud_success(upstream):
    upstream.return_value = httpx.Response(200, json={'choices': [{'message': {'content': ' answer '}}], 'usage': {'total_tokens': 12}})
    reply = await llm.chat('question', 'context')
    assert reply['text'] == 'answer' and reply['usage']['total_tokens'] == 12
    assert upstream.await_count == 1


@pytest.mark.parametrize('failure,attempts', [
    (httpx.ConnectTimeout('test'), 2),
    (httpx.ReadTimeout('test'), 1),
    (httpx.Response(401, text='denied'), 1),
    (httpx.Response(429, text='limited'), 2),
    (httpx.Response(500, text='error'), 2),
    (httpx.Response(200, text='<html>'), 1),
    (httpx.Response(200, json=[]), 1),
    (httpx.Response(200, json={'choices': []}), 2),
    (httpx.Response(200, json={'choices': [None]}), 1),
    (httpx.Response(200, json={'choices': [{'message': {'content': ['invalid']}}]}), 1),
])
async def test_upstream_failures_degrade_cleanly(upstream, failure, attempts):
    if isinstance(failure, Exception):
        upstream.side_effect = failure
    else:
        upstream.return_value = failure
    with pytest.raises(llm.LLMUnavailable):
        await llm.chat('question', 'context')
    assert upstream.await_count == attempts


async def test_disabled_and_missing_key_never_call_upstream(monkeypatch):
    monkeypatch.setattr(settings, 'llm_enabled', False)
    with pytest.raises(llm.LLMUnavailable):
        await llm.chat('question', 'context')
    monkeypatch.setattr(settings, 'llm_enabled', True)
    monkeypatch.setattr(settings, 'llm_api_key', '')
    with pytest.raises(llm.LLMUnavailable):
        await llm.chat('question', 'context')
    assert not llm.describe()['available']
    assert 'key' not in llm.describe()
