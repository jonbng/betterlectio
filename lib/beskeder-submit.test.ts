import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOMParser } from 'linkedom';
import {
  isEmptyMessageBody,
  messageSendResponseLooksSuccessful,
} from './beskeder-submit';

function doc(body: string): Document {
  return new DOMParser().parseFromString(
    `<html><body>${body}</body></html>`,
    'text/html',
  ) as unknown as Document;
}

describe('message compose validation', () => {
  test('rejects empty and formatting-only bodies', () => {
    assert.equal(isEmptyMessageBody(''), true);
    assert.equal(isEmptyMessageBody('  [b][/b]&nbsp; '), true);
    assert.equal(isEmptyMessageBody('[b]Hej[/b]'), false);
  });

  test('does not treat a returned compose form as a successful send', () => {
    const response = doc(`
      <div id="s_m_Content_Content_MessageThreadCtrl_RecipientsEditMode"></div>
      <textarea id="s_m_Content_Content_MessageThreadCtrl_MessagesGV_ctl02_EditModeContentBBTB_TbxNAME_tb"></textarea>
      <table id="s_m_Content_Content_MessageThreadCtrl_MessagesGV"></table>
    `);
    assert.equal(messageSendResponseLooksSuccessful(response), false);
  });

  test('accepts a returned thread after compose closes', () => {
    const response = doc(`
      <table id="s_m_Content_Content_MessageThreadCtrl_MessagesGV"></table>
      <textarea id="s_m_Content_Content_MessageThreadCtrl_MessagesGV_ctl06_EditModeContentBBTB_TbxNAME_tb"></textarea>
    `);
    assert.equal(messageSendResponseLooksSuccessful(response), true);
  });
});
