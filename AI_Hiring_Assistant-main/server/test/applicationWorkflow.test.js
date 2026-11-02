import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, createStageEvent } from '../src/services/applicationWorkflow.js';

test('application advances through screening, assessment, interview, offer and hire',()=>{
  const flow=[['applied','screening'],['screening','assessment'],['assessment','interview'],['interview','offer'],['offer','hired']];
  for(const [from,to] of flow) assert.equal(canTransition(from,to),true,from+' -> '+to);
});
test('rejection and withdrawal are available before terminal stages',()=>{
  for(const stage of ['applied','screening','assessment','interview','offer']) {
    assert.equal(canTransition(stage,'rejected'),true);
    assert.equal(canTransition(stage,'withdrawn'),true);
  }
});
test('terminal stages cannot be reopened through ordinary stage changes',()=>{
  for(const stage of ['hired','rejected','withdrawn']) {
    assert.equal(canTransition(stage,'screening'),false);
    assert.equal(canTransition(stage,'interview'),false);
  }
});
test('invalid transitions cannot create history events',()=>{
  assert.throws(()=>createStageEvent({from:'applied',to:'hired',actorId:'staff-1'}),/Invalid application stage transition/);
});
test('stage events retain actor, timestamp and bounded note',()=>{
  const event=createStageEvent({from:'screening',to:'assessment',actorId:'staff-1',note:'  Assessment assigned  ',at:'2026-11-02T10:00:00.000Z'});
  assert.deepEqual(event,{from:'screening',to:'assessment',at:'2026-11-02T10:00:00.000Z',actorType:'staff',actorId:'staff-1',note:'Assessment assigned'});
});
