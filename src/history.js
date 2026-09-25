import {state,snapshot,restore} from './state.js';
export function historyUI(){const element=document.querySelector('#history');element.innerHTML=state.history.map((entry,index)=>`<li class="${index===state.historyIndex?'current':''}">${entry.label}</li>`).join('')}
export function record(label,renderLayers,renderEditor){const saved=snapshot();state.history=state.history.slice(0,state.historyIndex+1);state.history.push({label,snapshot:saved});state.historyIndex=state.history.length-1;historyUI();renderLayers();renderEditor()}
export async function undo(renderLayers,renderEditor){if(state.historyIndex<=0)return;state.historyIndex-=1;await restore(state.history[state.historyIndex].snapshot);historyUI();renderLayers();renderEditor()}
export async function redo(renderLayers,renderEditor){if(state.historyIndex>=state.history.length-1)return;state.historyIndex+=1;await restore(state.history[state.historyIndex].snapshot);historyUI();renderLayers();renderEditor()}
