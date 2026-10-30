import { describe, expect, test } from 'bun:test';
import { parseHTML } from 'linkedom';
import { parseFravaerOverview, parseFravaersaarsager } from './fravaer-parse';

function parse(html: string) {
  return parseFravaerOverview(parseHTML(html).document);
}

describe('absence overview parsing', () => {
  test('parses expanded Periode, Opgjort, and For året metrics semantically', () => {
    const tooltip = [
      'Samlet',
      'Opgjort: 11,5%  16,5/144',
      'Periode: 14,0%  7/50',
      'For året: 3,2%  16,5/521',
    ].join('\n');
    const writtenTooltip = [
      'Samlet',
      'Opgjort: 0,0%  0/51',
      'Periode: 0,0%  0/29',
      'For året: 0,0%  0/223,5',
    ].join('\n');
    const html = `
      <div id="x_FravaerSamlet_Samletfravaer_pa">
        <span class="title-large">11,5%</span><span class="title-large">0,0%</span>
      </div>
      <table id="x_SFTabStudentAbsenceDataTable">
        <tr><th rowspan="3">Hold</th><th colspan="4">Almindeligt fravær</th><th colspan="4">Skriftligt fravær</th></tr>
        <tr><th colspan="2">Periode</th><th colspan="2">Opgjort</th><th colspan="2">Periode</th><th colspan="2">Opgjort</th></tr>
        <tr><th>Moduler</th><th>Procent</th><th>Moduler</th><th>Procent</th><th>Elevtid</th><th>Procent</th><th>Elevtid</th><th>Procent</th></tr>
        <tr><td><b>Samlet</b></td><td><span title="${tooltip}">7/50</span></td><td>14,0%</td><td>16,5/144</td><td>11,5%</td><td><span title="${writtenTooltip}">0/29</span></td><td>0,0%</td><td>0/51</td><td>0,0%</td></tr>
      </table>`;

    expect(parse(html).totals).toEqual({
      almPeriodePct: '14,0%',
      almPeriodeModuler: '7/50',
      almOpgjortPct: '11,5%',
      almOpgjortModuler: '16,5/144',
      almAarPct: '3,2%',
      almAarModuler: '16,5/521',
      skrPeriodePct: '0,0%',
      skrPeriodeTid: '0/29',
      skrOpgjortPct: '0,0%',
      skrOpgjortTid: '0/51',
      skrAarPct: '0,0%',
      skrAarTid: '0/223,5',
    });
  });

  test('keeps compact modern layout support', () => {
    const html = `
      <table id="x_SFTabStudentAbsenceDataTable">
        <tr><th rowspan="3">Hold</th><th colspan="2">Almindeligt fravær</th><th colspan="2">Skriftligt fravær</th></tr>
        <tr><th>Periode</th><th>Opgjort</th><th>Periode</th><th>Opgjort</th></tr>
        <tr><th>Moduler</th><th>Procent</th><th>Elevtid</th><th>Procent</th></tr>
        <tr><td><b>Samlet</b></td><td>6/69</td><td>8,0%</td><td>0/19</td><td>0,0%</td></tr>
      </table>`;

    const totals = parse(html).totals;
    expect(totals?.almOpgjortPct).toBe('8,0%');
    expect(totals?.almPeriodeModuler).toBe('6/69');
    expect(totals?.skrOpgjortPct).toBe('0,0%');
  });
});

describe('absence registration parsing', () => {
  test('keeps a missing-reason registration only once', () => {
    const activity = `<a class="s2skemabrik" data-brikid="ABS9" href="?absid=9">modul</a>`;
    const edit = `<a href="fravaer_aarsag.aspx?id=81975970642">ret</a>`;
    const html = `
      <table id="s_m_Content_Content_FatabMissingAarsagerGV">
        <tr><td>36</td><td>${activity}</td><td>Fravær 100%</td><td></td><td>${edit}</td></tr>
      </table>
      <table id="s_m_Content_Content_FatabAbsenceFravaerGV">
        <tr><td>36</td><td>${activity}</td><td>Fravær 100%</td><td>4/9-2026 HD</td><td></td><td></td><td>${edit}</td></tr>
      </table>`;

    const parsed = parseFravaersaarsager(parseHTML(html).document);
    expect(parsed.missingReasons).toHaveLength(1);
    expect(parsed.records).toHaveLength(0);
  });
});
