"""SMTP delivery tests: no network, provider credentials or real recipients."""
import asyncio
import smtplib
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from app.auth import send_account_email

@pytest.fixture
def smtp_config(monkeypatch):
    for name,value in {'SMTP_HOST':'live.smtp.mailtrap.io','SMTP_PORT':'587','SMTP_FROM':'QuizPop <hello@quizpop.name.ng>','SMTP_STARTTLS':'true','SMTP_USERNAME':'api','SMTP_PASSWORD':'test-only-secret'}.items():
        monkeypatch.setenv(name,value)
    with patch('app.auth.smtplib.SMTP') as factory:
        smtp=MagicMock();factory.return_value.__enter__.return_value=smtp;smtp.send_message.return_value={}
        yield factory,smtp

@pytest.mark.parametrize('action,subject', [('verify','Verify your QuizPop email'),('reset','Reset your QuizPop password')])
def test_account_emails_use_tls_credentials_and_multipart_links(smtp_config, action, subject):
    factory,smtp=smtp_config
    asyncio.run(send_account_email('recipient@example.com','secret/<&',action))
    factory.assert_called_once_with('live.smtp.mailtrap.io',587,timeout=15)
    smtp.starttls.assert_called_once();smtp.login.assert_called_once_with('api','test-only-secret')
    message=smtp.send_message.call_args.args[0]
    assert message['To']=='recipient@example.com' and message['Subject']==subject
    assert message.get_content_type()=='multipart/alternative'
    for part in message.iter_parts():
        assert f'/account/{action}?token=secret%2F%3C%26' in part.get_content()
    assert [call[0] for call in smtp.method_calls][:3]==['starttls','login','send_message']

@pytest.mark.parametrize('failure',[smtplib.SMTPAuthenticationError(535,b'private provider details'),smtplib.SMTPRecipientsRefused({'private@example.com':(554,b'demo restriction')}),TimeoutError('private host details'),smtplib.SMTPNotSupportedError('STARTTLS unsupported')])
def test_provider_failures_are_safe_retryable_errors(smtp_config, failure, caplog):
    _,smtp=smtp_config;smtp.send_message.side_effect=failure
    with pytest.raises(HTTPException) as error: asyncio.run(send_account_email('recipient@example.com','sensitive-token','verify'))
    assert error.value.status_code==503
    assert 'private' not in error.value.detail and 'sensitive-token' not in caplog.text and 'private' not in caplog.text

@pytest.mark.parametrize('setting,value',[('SMTP_PASSWORD','<YOUR_API_TOKEN>'),('SMTP_HOST',''),('SMTP_FROM',''),('SMTP_PORT','bad'),('SMTP_STARTTLS','false')])
def test_incomplete_or_insecure_mailtrap_config_fails_before_connecting(smtp_config, monkeypatch, setting, value):
    factory,_=smtp_config;monkeypatch.setenv(setting,value)
    with pytest.raises(HTTPException) as error: asyncio.run(send_account_email('recipient@example.com','token','verify'))
    assert error.value.status_code==503;factory.assert_not_called()
