import { beforeAll, describe, expect, test } from 'bun:test';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import { parseMessageEditSession, type FormState } from '../lib/beskeder-submit';

beforeAll(() => {
  globalThis.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
});

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('Lectio message edit form parsing', () => {
  const prefix = 's$m$Content$Content$MessageThreadCtrl$ThreadGrid$ctl17';
  const target = `${prefix}$EditModeToggleBtn`;
  const formState: FormState = {
    action: '/lectio/94/beskeder2.aspx?mappeid=-70',
    tokens: { __VIEWSTATEX: 'fresh-edit-viewstate' },
  };

  test('selects fields and save target from the requested dynamic row', () => {
    const other = 's$m$Content$Content$MessageThreadCtrl$ThreadGrid$ctl04';
    const session = parseMessageEditSession(parse(`
      <table>
        <tr>
          <td><input name="${other}$EditModeHeaderTitleTB$tb" value="Wrong"></td>
          <td><textarea name="${other}$EditModeContentBBTB$TbxNAME$tb">wrong</textarea></td>
          <td><a onclick="__doPostBack('${other}$SaveMessageBtn','')">Save</a></td>
        </tr>
        <tr>
          <td><input name="${prefix}$EditModeHeaderTitleTB$tb" value="Right &amp; exact"></td>
          <td><textarea name="${prefix}$EditModeContentBBTB$TbxNAME$tb">first line\n  second line</textarea></td>
          <td><a href="javascript:__doPostBack('${prefix}$UpdateMessageBtn','')">Save</a></td>
          <td><a onclick="__doPostBack('${prefix}$BackMessageBtn','')">Cancel</a></td>
        </tr>
      </table>
    `), target, formState);

    expect(session).not.toBeNull();
    expect(session?.formState).toBe(formState);
    expect(session?.titleFieldName).toBe(`${prefix}$EditModeHeaderTitleTB$tb`);
    expect(session?.bodyFieldName).toBe(`${prefix}$EditModeContentBBTB$TbxNAME$tb`);
    expect(session?.savePostbackTarget).toBe(`${prefix}$UpdateMessageBtn`);
    expect(session?.cancelPostbackTarget).toBe(`${prefix}$BackMessageBtn`);
    expect(session?.currentTitle).toBe('Right & exact');
    expect(session?.currentBody).toBe('first line\n  second line');
  });

  test('does not borrow controls from a different row', () => {
    const session = parseMessageEditSession(parse(`
      <tr><td>
        <input name="row1$EditModeHeaderTitleTB$tb" value="Wrong">
        <textarea name="row1$EditModeContentBBTB$TbxNAME$tb">wrong</textarea>
        <a onclick="__doPostBack('row1$SaveMessageBtn','')">Save</a>
      </td></tr>
    `), 'row2$EditModeToggleBtn', formState);

    expect(session).toBeNull();
  });

  test('accepts every observed Lectio save button name', () => {
    for (const button of ['SendMessageBtn', 'SaveMessageBtn', 'UpdateMessageBtn']) {
      const session = parseMessageEditSession(parse(`
        <tr><td>
          <input name="${prefix}$EditModeHeaderTitleTB$tb" value="Title">
          <textarea name="${prefix}$EditModeContentBBTB$TbxNAME$tb">Body</textarea>
          <a onclick="__doPostBack('${prefix}$${button}','')">Save</a>
        </td></tr>
      `), target, formState);
      expect(session?.savePostbackTarget).toBe(`${prefix}$${button}`);
    }
  });
});
