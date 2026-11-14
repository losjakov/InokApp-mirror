import { IonIcon, useIonAlert } from '@ionic/react';
import { chatbubbleOutline, eyeOffOutline, flagOutline, thumbsUp, thumbsUpOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import type { Article, Comment, Comments, Votes } from '@/data/api/types';
import { hiddenComments, hideComment, loadComments, type CommentsRead, NO_VOTES, reportComment, voteBar, votesClosed } from '@/data/repo/comments';
import { castMessage, type CastFailure } from '@/data/repo/cast';
import { SiteFormButton, useOnline } from './SiteFormButton';
import { openLink, openOnSite } from '@/native/intents';
import { longDate } from '@/i18n/date';
import { useApp } from '@/state/AppContext';

/** The site's anchor that opens its own comment form at once (A-33, InokSite T-1319). */
export const COMMENT_FORM = 'skm-comment-add';

/**
 * Comments of a publication or a video (A-33 + A-34): the approved ones, read-only, each with the site's two vote toggles; under
 * them «Додати коментар» = the site's own form in the in-app tab; when the tab closes, a short line and the comments re-read.
 * A-49 (Google Play UGC, R-32): under every comment and reply «Поскаржитися» (one report to the site's moderation, confirmed first;
 * D68: the dialog says one own sentence) and «Приховати» (this phone only, SQLite, undo in place); the site's rules above «Додати коментар».
 * News has none (the caller draws no block).
 */
export function CommentsBlock({ a, initial, onRead }: { a: Article; initial: Comments | null; onRead: (r: CommentsRead) => void }) {
  const { db, t, lang } = useApp();
  const [comments, setComments] = useState<Comments | null>(initial);
  const net = useOnline();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [closed, setClosed] = useState(votesClosed()); // learnt once (503 vote_closed): every toggle of the block goes quiet
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  useEffect(() => { let on = true; void hiddenComments(db).then((h) => on && setHidden(h)); return () => { on = false; }; }, [db]);
  const hide = async (cid: number, h: boolean) => {
    await hideComment(db, cid, h);
    setHidden((old) => { const n = new Set(old); if (h) n.add(cid); else n.delete(cid); return n; });
  };
  useEffect(() => {
    if (!status) return;
    const h = setTimeout(() => setStatus(null), 6000); // the site's vote status line: gone after 6 s
    return () => clearTimeout(h);
  }, [status]);
  const add = async () => {
    await openOnSite(a.site_url, lang, COMMENT_FORM);
    setPending(true);
    const r = await loadComments(db, a.id);
    if (r.comments) setComments(r.comments);
    onRead(r); // the re-read's fresh numbers (R-29) reach the stars too
  };
  const say = (f: CastFailure) => { if (f === 'closed') setClosed(true); setStatus(t(castMessage(f, 'vote'))); };
  const items = comments?.items ?? [];
  const rules = comments?.rules?.[lang] ?? null;
  const rulesUrl = comments?.rules_url?.[lang] ?? null;
  const own = { articleId: a.id, closed, onFailure: say, net, hidden, hide };
  return (
    <section className="aview__comments" data-testid="comments">
      <h2 className="inok-heading">{t('articles.comments')}{items.length > 0 && ` · ${comments!.total}`}</h2>
      {comments && items.length === 0 && <p className="comment__none">{t('comments.none')}</p>}
      {items.map((c) => (
        <div key={c.id} className="comment" data-testid={`comment-${c.id}`}>
          <CommentBody c={c} {...own} />
          {c.replies?.map((r) => (
            <div key={r.id} className="comment comment--reply" data-testid={`comment-${r.id}`}>
              <CommentBody c={r} {...own} />
            </div>
          ))}
        </div>
      ))}
      <p className="comment__note" role="status" data-testid="vote-status">{status ?? ''}</p>
      {/* A-49 (R-32): the site's own rules before its form; a link only when the site has a rules page */}
      {rules && (
        <div className="comment__rules" data-testid="comment-rules">
          <p className="comment__rules-h">{rulesUrl
            ? <a href={rulesUrl} onClick={(e) => { e.preventDefault(); void openLink(rulesUrl, lang); }} data-testid="comment-rules-link">{t('comments.rules')}</a>
            : t('comments.rules')}</p>
          <p className="comment__rules-text">{rules}</p>
        </div>
      )}
      {/* D54: the button keeps its own label (quiet offline); why it is quiet = the block's one grey line, as the vote and pending lines */}
      <SiteFormButton icon={chatbubbleOutline} label={t('comments.add')} offline={t('comments.add_offline')} onOpen={add} className="comment__add"
        testId="comment-add" offlineTestId="comment-offline" />
      {pending && <p className="comment__note" role="status" data-testid="comment-pending">{t('comments.pending')}</p>}
    </section>
  );
}

type Toggles = { articleId: number; closed: boolean; onFailure: (f: CastFailure) => void };
type Own = Toggles & { net: boolean; hidden: Set<number>; hide: (cid: number, h: boolean) => Promise<void> };
function CommentBody({ c, net, hidden, hide, ...rest }: { c: Omit<Comment, 'replies'> } & Own) {
  const { lang, t } = useApp();
  const [note, setNote] = useState<string | null>(null);
  if (hidden.has(c.id)) return (
    <p className="comment__hidden" data-testid={`comment-hidden-${c.id}`}>
      <span>{t('comments.hidden')}</span>
      <button type="button" className="comment__act" onClick={() => void hide(c.id, false)} data-testid={`comment-unhide-${c.id}`}>{t('comments.unhide')}</button>
    </p>
  );
  return (
    <>
      <p className="comment__head"><strong>{c.author}</strong> · {longDate(c.at, lang)}</p>
      <p className="comment__text">{c.text}</p>
      <div className="comment__bar">
        {/* a re-read answer (after the form's tab) starts the toggles afresh from the server's state */}
        <VoteToggles key={voteKey(c.votes)} cid={c.id} initial={c.votes ?? NO_VOTES} {...rest} />
        <span className="comment__acts">
          <ReportButton cid={c.id} articleId={rest.articleId} net={net} onNote={setNote} />
          <button type="button" className="comment__act" onClick={() => void hide(c.id, true)} data-testid={`comment-hide-${c.id}`}>
            <IonIcon icon={eyeOffOutline} aria-hidden="true" />{t('comments.hide')}
          </button>
        </span>
      </div>
      {note && <p className="comment__note comment__note--act" role="status" data-testid={`comment-report-note-${c.id}`}>{note}</p>}
    </>
  );
}

/** A-49 (R-32): «Поскаржитися» - offline says the network is needed; else the confirmation (one own sentence, D68), then ONE report and
 *  a short thanks under the comment; a refusal says why (the shared cast lines). Sent once per run: the button then rests. */
function ReportButton({ cid, articleId, net, onNote }: { cid: number; articleId: number; net: boolean; onNote: (s: string) => void }) {
  const { db, t } = useApp();
  const [ask] = useIonAlert();
  const [sent, setSent] = useState(false);
  const send = async () => {
    const r = await reportComment(db, articleId, cid);
    if (r.ok) setSent(true);
    onNote(t(r.ok ? 'comments.reported' : castMessage(r.failure, 'report')));
  };
  const press = () => {
    if (!net) { onNote(t('comments.report_offline')); return; }
    void ask({
      header: t('comments.report_title'), cssClass: 'inok-dialog',
      message: t('comments.report_text'), // D68: one own sentence; the site's form rules stay above «Додати коментар» only
      buttons: [{ text: t('common.cancel'), role: 'cancel' }, { text: t('comments.report_send'), handler: () => { void send(); } }],
    });
  };
  return (
    <button type="button" className="comment__act" onClick={press} disabled={sent} data-testid={`comment-report-${cid}`}>
      <IonIcon icon={flagOutline} aria-hidden="true" />{t('comments.report')}
    </button>
  );
}

const voteKey = (v?: Votes) => (v ? `${v.likes}:${v.dislikes}:${v.mine}` : '-');

/** A-34: the site's look — a thumb and its count, the dislike = the same thumb turned; filled when pressed, never colour alone. */
function VoteToggles({ cid, articleId, initial, closed, onFailure }: { cid: number; initial: Votes } & Toggles) {
  const { db, t } = useApp();
  const [v, setV] = useState(initial);
  const [bar] = useState(() => voteBar(db, articleId, cid, initial, (next, failure) => {
    setV(next);
    if (failure) onFailure(failure);
  }));
  const one = (k: 1 | -1, n: number, label: string) => (
    <button type="button" className={`vote vote--${k === 1 ? 'up' : 'down'}`} aria-pressed={v.mine === k} aria-disabled={closed || undefined}
      aria-label={`${label}: ${n}`} onClick={() => void bar.press(k)} data-testid={`vote-${k === 1 ? 'up' : 'down'}-${cid}`} data-mine={v.mine === k ? 'y' : 'n'}>
      <IonIcon icon={v.mine === k ? thumbsUp : thumbsUpOutline} aria-hidden="true" />
      <span className="vote__n" aria-hidden="true">{n}</span>
    </button>
  );
  return (
    <div className="comment__votes" role="group" aria-label={`${t('comments.like')} / ${t('comments.dislike')}`} data-closed={closed ? 'y' : 'n'}>
      {one(1, v.likes, t('comments.like'))}
      {one(-1, v.dislikes, t('comments.dislike'))}
    </div>
  );
}
