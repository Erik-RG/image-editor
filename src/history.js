import {state,snapshot,restore} from './state.js';
export function historyUI(){const e=document.querySelector('#history');e.innerHTML=state.history.map((x,i)=>`<li class="${i===state.historyIndex?'current':''}">${x}</li>`).join('')}
export async function undo(){if(state.historyIndex<=0)return;state.historyIndex--;await restore(state.history[state.historyIndex].snapshot);historyUI()}
export async function redo(){if(state.historyIndex>=state.history.length-1)return;state.historyIndex++;await restore(state.history[state.historyIndex].snapshot);historyUI()}
export function makeRecorder(renderLayers,renderEditor){return async(label)=>{const s=snapshot();state.history=state.history.slice(0,state.historyIndex+1);state.history.push({label,snapshot:s});state.historyIndex=state.history.length-1;historyUI();renderLayers();renderEditor()}}
