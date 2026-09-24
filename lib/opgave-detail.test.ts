import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOMParser } from 'linkedom';
import { isMeaningfulAssignmentGrade, parseOpgaveDetail } from './opgave-detail';

describe('isMeaningfulAssignmentGrade', () => {
  test('rejects Lectio placeholders without hiding the -3 grade', () => {
    assert.equal(isMeaningfulAssignmentGrade(''), false);
    assert.equal(isMeaningfulAssignmentGrade('--'), false);
    assert.equal(isMeaningfulAssignmentGrade('—'), false);
    assert.equal(isMeaningfulAssignmentGrade('-3'), true);
    assert.equal(isMeaningfulAssignmentGrade('Bestået'), true);
  });
});

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

  test('keeps an empty group editor visible and ignores its prompt option', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body>
        <form id="aspnetForm" action="/lectio/94/ElevAflevering.aspx">
          <span id="m_Content_NameLbl">Gruppeopgave</span>
          <div id="m_Content_showAddToGroupPanel">
            <select id="m_Content_groupStudentAddDD">
              <option value="">Vælg elev</option>
              <option value="S1" disabled>Optaget elev</option>
            </select>
          </div>
        </form>
      </body></html>
    `, 'text/html') as unknown as Document;

    const detail = parseOpgaveDetail(
      doc,
      'https://www.lectio.dk/lectio/94/ElevAflevering.aspx?exerciseid=1',
    );

    assert.equal(detail.hasGroupForm, true);
    assert.deepEqual(detail.availableGroupStudents, []);
  });

  test('only exposes selectable students from the group dropdown', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body>
        <form id="aspnetForm" action="/lectio/94/ElevAflevering.aspx">
          <span id="m_Content_NameLbl">Gruppeopgave</span>
          <div id="m_Content_showAddToGroupPanel">
            <select id="m_Content_groupStudentAddDD">
              <option value="">Vælg elev</option>
              <option value="727">Ada Lovelace</option>
            </select>
          </div>
        </form>
      </body></html>
    `, 'text/html') as unknown as Document;

    const detail = parseOpgaveDetail(
      doc,
      'https://www.lectio.dk/lectio/94/ElevAflevering.aspx?exerciseid=1',
    );

    assert.deepEqual(detail.availableGroupStudents, [{ name: 'Ada Lovelace', value: '727' }]);
  });
});

describe('parseOpgaveDetail assignment feedback', () => {
  test('strips duplicated mobile labels and display units from assignment metadata', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body><form id="aspnetForm">
        <span id="m_Content_NameLbl">Opgave</span>
        <table>
          <tr><th>Ansvarlig:</th><td><label class="OnlyMobile">Ansvarlig:</label>Ida Vestmø Nygaard (IN)</td></tr>
          <tr><th>Opgavenote:</th><td><div class="ls-elevaflevering-info-field"><label class="OnlyMobile">Opgavenote:</label><span class="ls-elevaflevering-value">Rettes med lilla<br>i dokumentet</span></div></td></tr>
        </table>
        <span id="m_Content_WeightLbl">2,5 timer</span>
      </form></body></html>
    `, 'text/html') as unknown as Document;

    const detail = parseOpgaveDetail(doc, 'https://www.lectio.dk/lectio/94/ElevAflevering.aspx?exerciseid=1');

    assert.equal(detail.responsible, 'Ida Vestmø Nygaard (IN)');
    assert.equal(detail.studentTime, '2,5');
    assert.equal(detail.note, 'Rettes med lilla<br>i dokumentet');
  });

  test('maps student feedback by labels when columns are reordered', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body><form id="aspnetForm">
        <span id="m_Content_NameLbl">Skriveøvelse</span>
        <table id="m_Content_StudentGV">
          <tr><th>Elev</th><th>Elevnote</th><th>Karakter</th><th>Afventer</th><th>Afsluttet</th><th>Karakternote</th><th>Status</th></tr>
          <tr>
            <td><span class="ls-elevaflevering-field-label">Elev:</span><span data-lectioContextCard="S42">Ada</span></td>
            <td><span class="ls-elevaflevering-field-label">Elevnote:</span><span class="ls-elevaflevering-note-value">God struktur<br>Husk kilder</span></td>
            <td><span class="ls-elevaflevering-field-label">Karakter:</span><span class="ls-elevaflevering-field-value"></span></td>
            <td><span class="ls-elevaflevering-field-label">Afventer:</span><span class="ls-elevaflevering-field-value">Elev</span></td>
            <td><span class="ls-elevaflevering-field-label">Afsluttet:</span><input type="checkbox" checked disabled></td>
            <td><span class="ls-elevaflevering-field-label">Karakternote:</span><span class="ls-elevaflevering-note-value">Flot analyse</span></td>
            <td><span class="ls-elevaflevering-field-label">Status - fravær:</span><span class="ls-elevaflevering-field-value">Afleveret / Fravær: 0%</span></td>
          </tr>
        </table>
      </form></body></html>
    `, 'text/html') as unknown as Document;

    const detail = parseOpgaveDetail(doc, 'https://www.lectio.dk/lectio/94/ElevAflevering.aspx?elevid=42&exerciseid=1');

    assert.deepEqual(detail.students[0], {
      name: 'Ada',
      contextCardId: 'S42',
      awaiting: 'Elev',
      statusText: 'Afleveret / Fravær: 0%',
      isCompleted: true,
      grade: '',
      gradeNote: 'Flot analyse',
      studentNote: 'God struktur\nHusk kilder',
    });
  });

  test('ignores the duplicated mobile column and parses teacher feedback', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body><form id="aspnetForm">
        <span id="m_Content_NameLbl">Opgave</span>
        <table id="m_Content_RecipientGV">
          <tr><th></th><th>Tidspunkt</th><th>Bruger</th><th>Indlæg</th><th>Dokument</th></tr>
          <tr class="separationCell">
            <td class="OnlyMobile"><div><span class="ls-elevaflevering-entry-label">Bruger:</span><span class="ls-elevaflevering-entry-value"><span data-lectioContextCard="T99">Lærer</span></span></div></td>
            <td class="OnlyDesktop">24/9-2026 10:15</td>
            <td class="OnlyDesktop"><span data-lectioContextCard="T99" title="Lise Lærer">LL</span></td>
            <td class="OnlyDesktop">Se mine kommentarer<br>i dokumentet</td>
            <td class="OnlyDesktop"><a href="/lectio/94/ExerciseFileGet.aspx?entryid=7">ForsÃ¸g rettet.pdf</a></td>
          </tr>
        </table>
      </form></body></html>
    `, 'text/html') as unknown as Document;

    const detail = parseOpgaveDetail(doc, 'https://www.lectio.dk/lectio/94/ElevAflevering.aspx?exerciseid=1');

    assert.deepEqual(detail.entries[0], {
      timestamp: '24/9-2026 10:15',
      user: 'Lise Lærer',
      userContextCardId: 'T99',
      isTeacher: true,
      isReturn: true,
      comment: 'Se mine kommentarer\ni dokumentet',
      documentName: 'Forsøg rettet.pdf',
      documentUrl: 'https://www.lectio.dk/lectio/94/ExerciseFileGet.aspx?entryid=7',
    });
  });
});
