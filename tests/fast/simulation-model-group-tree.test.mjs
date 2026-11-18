import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModelGroupTree,modelGroupPath,modelGroupAtPath,dissolveModelGroup,moveModelsToGroup} from '../../2_3DSimulation/model-group-tree-core.mjs';
const tree=()=>[{name:'Module',modelIds:['belt','camera','sensor'],collapsed:false,children:[{name:'Belt',modelIds:['belt']},{name:'Camera',modelIds:['camera']},{name:'Sensor',modelIds:['sensor']}]}];
test('nested groups retain parent selection members and remove missing/duplicate child membership',()=>{
 const data=tree();data[0].children[1].modelIds.push('belt','gone');data.push({name:'Duplicate',modelIds:['belt']});
 const result=normalizeModelGroupTree(data,new Set(['belt','camera','sensor']));assert.equal(result.length,1);assert.deepEqual(result[0].modelIds,['belt','camera','sensor']);assert.deepEqual(result[0].children.map(g=>g.modelIds),[['belt'],['camera'],['sensor']]);
 assert.deepEqual(normalizeModelGroupTree(JSON.parse(JSON.stringify(result)),new Set(result[0].modelIds)),result);
});
test('legacy flat model group serialization remains unchanged',()=>{
 const groups=[{name:'Old',modelIds:['a'],collapsed:true,treeOrderId:'old'}];assert.deepEqual(normalizeModelGroupTree(groups,new Set(['a'])),groups);
});
test('nested group paths resolve context menu target and dissolve preserves parent membership',()=>{
 const groups=tree(),sensor=groups[0].children[2];assert.deepEqual(modelGroupPath(groups,sensor),[0,2]);assert.equal(modelGroupAtPath(groups,[0,2]),sensor);
 dissolveModelGroup(groups,sensor);assert.deepEqual(groups[0].modelIds,['belt','camera','sensor']);assert.equal(groups[0].children.length,2);
 dissolveModelGroup(groups,groups[0]);assert.deepEqual(groups.map(g=>g.name),['Belt','Camera']);
});
test('dragging models into a nested group updates every ancestor and removes old membership',()=>{
 const groups=tree();groups.push({name:'Outside',modelIds:['other']});const target=groups[0].children[2];moveModelsToGroup(groups,target,['camera','other']);
 const result=normalizeModelGroupTree(groups,new Set(['belt','camera','sensor','other']));assert.equal(result.length,1);assert.deepEqual(new Set(result[0].modelIds),new Set(['belt','camera','sensor','other']));assert.deepEqual(result[0].children.map(g=>g.name),['Belt','Sensor']);assert.deepEqual(result[0].children[1].modelIds,['sensor','camera','other']);
});
test('removing a model prunes its nested folder without dropping the remaining module',()=>{
 const result=normalizeModelGroupTree(tree(),new Set(['belt','camera']));assert.deepEqual(result[0].children.map(g=>g.name),['Belt','Camera']);assert.deepEqual(result[0].modelIds,['belt','camera']);
});
