'use strict';
const {version,definitions}=require('../assets/modules.js');
console.log(JSON.stringify({core:version,modules:Object.entries(definitions).map(([id,d])=>({id,version:d.version,parameter:d.parameter,fields:d.fields,layers:d.layers,annotationObjects:d.objects||[]}))},null,2));
