import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOMParser } from 'linkedom';
import { parseOpgaveDetail } from './opgave-detail';

describe('parseOpgaveDetail group removal', () => {
  test('reads a delete postback from onclick when href is a placeholder', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body>
        <form id="aspnetForm" action="/lectio/94/ElevAflevering.aspx">
          <span id="m_Content_NameLbl">Gruppeopgave</span>
          <table id="m_Content_groupMembersGV">
            <tr><th>Navn</th><th></th></tr>
            <tr>
              <td><span data-lectiocontextcard="S123">Ada Lovelace</span></td>
              <td class="noprint"><a href="#" onclick="javascript:__doPostBack('m$Content$groupMembersGV','DEL$1'); return false;">Fjern</a></td>
            </tr>
          </table>
        </form>
      </body></html>
    `, 'text/html') as unknown as Document;

    const detail = parseOpgaveDetail(
      doc,
      'https://www.lectio.dk/lectio/94/ElevAflevering.aspx?exerciseid=1',
    );

    assert.equal(detail.groupMembers.length, 1);
    assert.deepEqual(detail.groupMembers[0], {
      name: 'Ada Lovelace',
      contextCardId: 'S123',
      removePostbackTarget: 'm$Content$groupMembersGV',
      removePostbackArgument: 'DEL$1',
    });
  });
});
