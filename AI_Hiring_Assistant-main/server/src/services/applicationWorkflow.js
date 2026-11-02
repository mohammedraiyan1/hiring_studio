export const STAGE_TRANSITIONS = Object.freeze({
  applied: ['screening','interview','rejected','withdrawn'],
  screening: ['assessment','interview','rejected','withdrawn'],
  assessment: ['interview','rejected','withdrawn'],
  interview: ['offer','rejected','withdrawn','assessment'],
  offer: ['hired','rejected','withdrawn','interview'],
  hired: [],
  rejected: [],
  withdrawn: [],
  pending: ['screening','interview','rejected','withdrawn'],
  completed: ['interview','offer','rejected'],
});
export function canTransition(from, to) {
  return Object.prototype.hasOwnProperty.call(STAGE_TRANSITIONS, from) && STAGE_TRANSITIONS[from].includes(to);
}
export function createStageEvent({from,to,actorId,actorType='staff',note='',at=new Date().toISOString()}) {
  if (!canTransition(from,to)) throw new Error('Invalid application stage transition: ' + from + ' -> ' + to);
  return {from,to,at,actorType,actorId,note:String(note).trim().slice(0,1000)};
}
