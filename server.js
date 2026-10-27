#!/usr/bin/env node
// Minimal A2A‑Mesh hub (demo) – provides the endpoints used by tools/a2a.js
// Only for local testing; stores data in memory.
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
app.use(bodyParser.json());

// Serve static files from project root (index.html, css/, js/, etc.)
app.use(express.static(path.join(__dirname)));

let nextMsgId = 1;
let peers = [];
let messages = [];
let tasks = [];
let locks = [];

function now(){return Date.now();}

app.post('/api/join', (req,res)=>{
  const {name, room, token} = req.body;
  if(!peers.find(p=>p.name===name)) peers.push({name, room, token});
  res.json({you:name, room, peers:peers.map(p=>({name:p.name})) , tasks, locks});
});

app.post('/api/send', (req,res)=>{
  const {from, to, type, text, room, token} = req.body;
  const msg={id:nextMsgId++, ts:now(), from, to:to||null, type:type||'chat', text, room, token};
  messages.push(msg);
  res.json({id:msg.id});
});

app.get('/api/messages', (req,res)=>{
  // simple filter by id > since if provided
  const since = parseInt(req.query.since||'0',10);
  const filtered = messages.filter(m=>m.id>since);
  res.json({messages:filtered});
});

app.get('/api/state', (req,res)=>{
  res.json({peers, tasks, locks, typing:[]});
});

app.get('/api/tasks', (req,res)=>{ res.json({tasks}); });
app.get('/api/locks', (req,res)=>{ res.json({locks}); });

// claim task
app.post('/api/tasks/claim', (req,res)=>{
  const from = req.body.from || req.body.name;
  const {id, title, note, ttl} = req.body;
  const existing = tasks.find(t=>t.id===id);
  const leaseUntil = now() + (ttl||1800)*1000;
  if(existing && existing.status!=='done' && existing.assignee!==from){
    return res.status(409).json({error:`Task "${id}" already claimed by ${existing.assignee}`});
  }
  if(existing){ existing.status='in-progress'; existing.assignee=from; existing.leaseUntil=leaseUntil; }
  else tasks.push({id, title:title||id, note:note||'', assignee:from, owner:from, status:'in-progress', claimedAt:now(), leaseUntil});
  res.json({ok:true, task: tasks.find(t=>t.id===id)});
});

// release task
app.post('/api/tasks/release', (req,res)=>{
  const {from, id} = req.body;
  const t = tasks.find(t=>t.id===id && t.assignee===from);
  if(!t) return res.status(404).json({error:'not found or not yours'});
  t.status='open'; t.assignee=null;
  res.json({ok:true});
});

// done task
app.post('/api/tasks/done', (req,res)=>{
  const {from, id, result} = req.body;
  const t = tasks.find(t=>t.id===id);
  if(!t) return res.status(404).json({error:'task not found'});
  t.status='done'; t.result=result||''; t.doneAt=now();
  res.json({ok:true, task:t});
});

// lock files (acquire)
app.post('/api/locks/acquire', (req,res)=>{
  const from = req.body.from || req.body.name;
  const fileList = Array.isArray(req.body.files) ? req.body.files : [req.body.files].filter(Boolean);
  const conflicts = locks.filter(l=>fileList.includes(l.file) && l.owner!==from);
  if(conflicts.length) return res.status(409).json({error:`Locked by ${conflicts[0].owner}: ${conflicts[0].file}`});
  const granted = [];
  for(const file of fileList){
    if(!locks.find(l=>l.file===file && l.owner===from)){ locks.push({file, agent:from, owner:from, lockedAt:now(), expiresIn:1800}); }
    granted.push(file);
  }
  res.json({ok:true, granted, locks});
});

// unlock files (release)
app.post('/api/locks/release', (req,res)=>{
  const from = req.body.from || req.body.name;
  const files = req.body.files;
  const before = locks.length;
  if(files && files.length) locks = locks.filter(l=>!(l.owner===from && files.includes(l.file)));
  else locks = locks.filter(l=>l.owner!==from);
  const released = [];
  res.json({ok:true, released, locks});
});

app.post('/api/ping', (req,res)=>{ res.json({ok:true, name: req.body.from}); });

const PORT=7777;
app.listen(PORT,()=>{console.log(`A2A‑Mesh hub listening on http://localhost:${PORT}`);});
