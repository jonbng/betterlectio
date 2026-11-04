import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOMParser } from 'linkedom';
import { parseOpgaverFromDOM } from './OpgaverPage';

describe('parseOpgaverFromDOM teacher returns', () => {
  test('maps columns by header and treats Elevnote as permanent return evidence', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body>
        <table id="s_m_Content_Content_ExerciseGV">
          <tr>
            <th class="OnlyDesktop">Hold</th><th class="OnlyDesktop">Uge</th>
            <th class="OnlyDesktop">Opgavetitel</th><th class="OnlyDesktop">Frist</th>
            <th class="OnlyDesktop">Elev­tid</th><th class="OnlyDesktop">Status</th>
            <th class="OnlyDesktop">Fravær</th><th class="OnlyDesktop">Afventer</th>
            <th class="OnlyDesktop">Elevnote</th><th class="OnlyDesktop">Opgavenote</th>
            <th class="OnlyDesktop">Karakter</th>
          </tr>
          <tr>
            <td class="OnlyDesktop">2v Ma</td><td class="OnlyDesktop">43</td>
            <td class="OnlyDesktop"><a href="/lectio/94/ElevAflevering.aspx?elevid=42&amp;exerciseid=7">Øvelse 4</a></td>
            <td class="OnlyDesktop">23/10-2026 20:00</td><td class="OnlyDesktop">4,00</td>
            <td class="OnlyDesktop">Afleveret</td><td class="OnlyDesktop">0 %</td>
            <td class="OnlyDesktop"></td><td class="OnlyDesktop">Flot argumentation</td>
            <td class="OnlyDesktop">Opgavens instruktion</td><td class="OnlyDesktop">12<br /></td>
          </tr>
        </table>
      </body></html>
    `, 'text/html') as unknown as Document;

    const [entry] = parseOpgaverFromDOM(doc);
    assert.equal(entry.hold, '2v Ma');
    assert.equal(entry.note, 'Opgavens instruktion');
    assert.equal(entry.studentNote, 'Flot argumentation');
    assert.equal(entry.grade, '12');
    assert.deepEqual(entry.teacherReturn.kinds, ['grade', 'comment']);
    assert.equal(entry.teacherReturn.state, 'returned');
  });

  test('keeps a blank completed list row unknown until detail enrichment', () => {
    const doc = new DOMParser().parseFromString(`
      <html><body>
        <table id="s_m_Content_Content_ExerciseGV">
          <tr>
            <th class="OnlyDesktop">Uge</th><th class="OnlyDesktop">Hold</th>
            <th class="OnlyDesktop">Opgavetitel</th><th class="OnlyDesktop">Frist</th>
            <th class="OnlyDesktop">Elevtid</th><th class="OnlyDesktop">Status</th>
            <th class="OnlyDesktop">Fravær</th><th class="OnlyDesktop">Afventer</th>
            <th class="OnlyDesktop">Opgavenote</th><th class="OnlyDesktop">Karakter</th>
            <th class="OnlyDesktop">Elevnote</th>
          </tr>
          <tr>
            <td class="OnlyDesktop">43</td><td class="OnlyDesktop">2v Ma</td>
            <td class="OnlyDesktop"><a href="/lectio/94/ElevAflevering.aspx?elevid=42&amp;exerciseid=7">Øvelse 4</a></td>
            <td class="OnlyDesktop">23/10-2026 20:00</td><td class="OnlyDesktop">4,00</td>
            <td class="OnlyDesktop">Afleveret</td><td class="OnlyDesktop">0 %</td>
            <td class="OnlyDesktop"></td><td class="OnlyDesktop"></td>
            <td class="OnlyDesktop"><br /></td><td class="OnlyDesktop"></td>
          </tr>
        </table>
      </body></html>
    `, 'text/html') as unknown as Document;

    const [entry] = parseOpgaverFromDOM(doc);
    assert.equal(entry.teacherReturn.state, 'unknown');
  });
});
