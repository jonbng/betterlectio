import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOMParser } from 'linkedom';
import { getGroupEditUrl, parseHoldGroupLinks } from './group-admin';

const BASE_URL = 'https://www.lectio.dk/lectio/94/subnav/members.aspx?holdelementid=1';

function documentFor(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html') as unknown as Document;
}

describe('group administration', () => {
  test('returns an enabled same-origin Lectio edit link', () => {
    const doc = documentFor('<a id="s_m_Content_Content_editgrplink" href="/lectio/94/subnav/EditGroup.aspx?id=1">Rediger gruppe</a>');
    assert.equal(
      getGroupEditUrl(doc, BASE_URL),
      'https://www.lectio.dk/lectio/94/subnav/EditGroup.aspx?id=1',
    );
  });

  test('rejects disabled, external, and script edit links', () => {
    assert.equal(getGroupEditUrl(documentFor('<a id="s_m_Content_Content_editgrplink" class="aspNetDisabled">Rediger</a>'), BASE_URL), null);
    assert.equal(getGroupEditUrl(documentFor('<a id="x_editgrplink" href="https://example.test/edit">Rediger</a>'), BASE_URL), null);
    assert.equal(getGroupEditUrl(documentFor('<a id="x_editgrplink" href="javascript:alert(1)">Rediger</a>'), BASE_URL), null);
  });

  test('parses and deduplicates safe hold and group schedule links', () => {
    const doc = documentFor(`
      <div id="s_m_Content_Content_holdgruppeIsland_pa">
        <a href="/lectio/94/SkemaNy.aspx?type=holdelement&amp;holdelementid=1">2v MA</a>
        <a href="/lectio/94/SkemaNy.aspx?type=holdelement&amp;holdelementid=1">2v MA igen</a>
        <a href="https://example.test/phishing">Ekstern</a>
        <a href="javascript:alert(1)">Usikker</a>
      </div>
    `);
    assert.deepEqual(parseHoldGroupLinks(doc, BASE_URL), [
      {
        label: '2v MA',
        url: 'https://www.lectio.dk/lectio/94/SkemaNy.aspx?type=holdelement&holdelementid=1',
      },
    ]);
  });
});
