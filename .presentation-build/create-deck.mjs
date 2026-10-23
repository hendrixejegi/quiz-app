import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from 'file:///C:/Users/tosan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import { pathToFileURL } from 'node:url';

const skillDir = 'C:/Users/tosan/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations';
const workspaceDir = 'C:/Users/tosan/l2e/project-1';
const buildDir = path.join(workspaceDir, '.presentation-build');
const outputDir = path.join(workspaceDir, 'presentation-output');
const finalPath = path.join(outputDir, 'live-quiz-demo.pptx');
await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const C = { purple: '#5B1E91', white: '#FFFFFF', red: '#EB0000', lavender: '#BDB5E9', ink: '#111827', gray: '#4B5563', pale: '#F5F2FA' };
const FONT = 'Aptos';
const pres = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function text(slide, name, value, x, y, w, h, size, color=C.ink, bold=false, opts={}) {
  const s = slide.shapes.add({ geometry: 'textbox', name, position: { left:x, top:y, width:w, height:h }, fill:'none', line:{ style:'solid', fill:'none', width:0 } });
  s.text = value;
  s.text.style = { fontFamily: FONT, fontSize:size, color, bold, verticalAlignment: 'middle', alignment: opts.align ?? 'left', wrap: true };
  return s;
}
function rect(slide, name, x, y, w, h, fill, radius=0) {
  return slide.shapes.add({ geometry: radius ? 'roundRect' : 'rect', name, position:{left:x,top:y,width:w,height:h}, fill, line:{style:'solid',fill:'none',width:0}, ...(radius?{borderRadius:radius}:{}) });
}
function base(title, n, time) {
  const s = pres.slides.add(); s.background.fill = C.white;
  text(s, `slide-${n}-title`, title, 72, 52, 1090, 66, 36, C.purple, true);
  rect(s, `slide-${n}-rule`, 72, 130, 78, 6, C.red);
  text(s, `slide-${n}-time`, time, 1080, 58, 130, 24, 15, C.gray, false, {align:'right'});
  text(s, `slide-${n}-number`, `${String(n).padStart(2,'0')} / 05`, 1090, 674, 120, 20, 13, C.gray, false, {align:'right'});
  return s;
}

// 1 — Opening
{
  const s = pres.slides.add(); s.background.fill = C.purple;
  rect(s, 'cover-red-accent', 82, 92, 12, 520, C.red);
  text(s, 'cover-eyebrow', 'LIVE DEMO  ·  5 MINUTES', 132, 115, 480, 32, 17, C.lavender, true);
  text(s, 'cover-title', 'A quiz everyone\ncan join', 128, 185, 900, 210, 62, C.white, true);
  text(s, 'cover-subtitle', 'Create a room. Share a link. Play together.', 134, 424, 850, 56, 28, C.white, false);
  text(s, 'cover-prompt', 'We’ll try it live, then look behind the host screen.', 134, 548, 930, 40, 20, C.lavender, false);
  s.speakerNotes.text = '0:20. Welcome everyone. Set the expectation: this is a short, hands-on tour. Tell the audience they will join a quiz from their own phones or laptops.';
}
// 2 — Product overview
{
  const s = base('What the app does', 2, '0:45');
  text(s, 'overview-intro', 'A host runs a timed quiz while everyone plays in the same live room.', 72, 164, 1040, 78, 29, C.ink, true);
  const labels = [
    ['01', 'Build', 'Add questions, answer choices, and a timer.'],
    ['02', 'Invite', 'Share the participant link. People join with a display name.'],
    ['03', 'Play', 'Answer before time runs out; standings update between questions.'],
  ];
  const ys = [300, 414, 528];
  labels.forEach((it,i) => {
    text(s, `overview-${i}-num`, it[0], 74, ys[i], 70, 44, 22, C.red, true);
    text(s, `overview-${i}-label`, it[1], 164, ys[i]-2, 170, 48, 27, C.purple, true);
    text(s, `overview-${i}-desc`, it[2], 354, ys[i], 790, 54, 21, C.gray, false);
  });
  s.speakerNotes.text = '0:45. Keep the overview brief. Explain that the live experience is the focus: one person hosts, participants join with a link, questions are timed, and standings appear during the game.';
}
// 3 — Audience participation
{
  const s = base('Your turn: join the quiz', 3, '1:45');
  text(s, 'join-instruction', 'Open this link on your phone', 72, 166, 900, 58, 34, C.ink, true);
  rect(s, 'join-link-highlight', 72, 252, 920, 126, C.pale, 24);
  text(s, 'join-link-placeholder', '[PASTE LIVE PARTICIPANT LINK HERE]', 104, 278, 860, 72, 25, C.purple, true);
  text(s, 'join-steps', 'Choose a display name  ·  Wait for the host  ·  Answer each question', 76, 426, 1090, 50, 22, C.gray, false);
  text(s, 'join-live-note', 'We’ll play 2–3 quick questions together', 76, 526, 980, 46, 25, C.red, true);
  s.speakerNotes.text = '1:45. Before presenting, replace the bracketed placeholder with the public participant link from a launched quiz, or show the corresponding QR code. Ask everyone to join and choose a display name. Wait for the room to fill, then start the quiz from the host screen. Use a short 2–3 question demo so the interaction fits the time. If the room is slow to populate, narrate the join steps and continue with one volunteer.';
}
// 4 — Host and results
{
  const s = base('What the host sees', 4, '1:10');
  text(s, 'host-desc', 'The host controls the room. Participants see the quiz.', 72, 164, 1080, 58, 29, C.ink, true);
  text(s, 'host-heading', 'HOST VIEW', 74, 280, 300, 26, 16, C.red, true);
  text(s, 'host-bullets', '• Live question and countdown\n• Who has joined\n• Full leaderboard', 74, 324, 485, 190, 24, C.purple, false);
  rect(s, 'host-divider', 628, 280, 2, 286, C.lavender);
  text(s, 'player-heading', 'PLAYER VIEW', 690, 280, 320, 26, 16, C.red, true);
  text(s, 'player-bullets', '• Timed answer choices\n• Correctness and points\n• Top three and rank movement\n• Final standings and answer review', 690, 324, 510, 220, 22, C.purple, false);
  text(s, 'host-caveat', 'The server keeps time and calculates scores.', 74, 590, 1010, 34, 18, C.gray, false);
  s.speakerNotes.text = '1:10. While the audience plays, show the host screen. Point out the timer, participant count, and full leaderboard. Explain that participants see their own result and the top three after each question; the final screen includes their answer review. Do not dwell on implementation details.';
}
// 5 — Closing
{
  const s = pres.slides.add(); s.background.fill = C.purple;
  text(s, 'close-title', 'That’s the loop', 82, 74, 920, 64, 42, C.white, true);
  rect(s, 'close-red-accent', 82, 164, 78, 6, C.red);
  text(s, 'close-flow', 'Create  →  Share  →  Play  →  See results', 82, 232, 1110, 76, 35, C.white, true);
  text(s, 'close-detail', 'A lightweight way to turn a group into a live quiz room.', 84, 354, 1050, 60, 26, C.lavender, false);
  text(s, 'close-next', 'Next: try a longer quiz, explore question setup, or test the host controls.', 84, 486, 1050, 64, 21, C.white, false);
  text(s, 'close-thanks', 'Thanks — what would you like to try?', 84, 590, 950, 42, 24, C.white, true);
  s.speakerNotes.text = '0:35. Recap the simple flow and invite one follow-up action: a longer quiz, creating a quiz, or a closer look at host controls. Planned items such as admin access and deployment are not included in this demo; avoid describing them as available features.';
}

for (const [i, slide] of pres.slides.items.entries()) {
  const blob = await pres.export({ slide, format:'png', scale:1 });
  await fs.writeFile(path.join(buildDir, `slide-${String(i+1).padStart(2,'0')}.png`), new Uint8Array(await blob.arrayBuffer()));
}
const montage = await pres.export({ format:'webp', montage:true });
await fs.writeFile(path.join(buildDir,'montage.webp'), new Uint8Array(await montage.arrayBuffer()));

const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir,'container_tools/artifact_tool_utils.mjs')).href);
const stagingDir = path.join(workspaceDir,'.codex-finalizer');
await fs.mkdir(stagingDir,{recursive:true});
const candidatePath = path.join(stagingDir,'live-quiz-demo-candidate.pptx');
await (await PresentationFile.exportPptx(pres)).save(candidatePath);
const result = await finalizePresentation({
  explicitTotalSlideCount:5,
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable:'C:/Users/tosan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  integrityValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  requiredNativeTableOwnerSlides:[],
  requiredNativeChartOwnerSlides:[],
  fontPolicy:{basis:'design',families:[FONT]},
  verifyArtifactToolImport:true,
  receiptPath:path.join(stagingDir,'live-quiz-demo-validation.json'),
});
console.log(JSON.stringify(result));



