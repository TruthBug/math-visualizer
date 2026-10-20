'use strict';
const {version,definitions}=require('../assets/modules.js');
/* schema 模块（function-graph）的参数、图层、字段由配置里的 model 推出，这里列出可用对象类型。 */
console.log(JSON.stringify({core:version,modules:Object.entries(definitions).map(([id,d])=>d.schema?{id,version:d.version,parameter:'set by model.param in each config',fields:'derived from model.objects',layers:'object ids from model.objects',objectTypes:d.objectTypes,annotationObjects:[],drag:'y for hline y=param; x for vline/point x=param'}:({id,version:d.version,parameter:d.parameter,fields:d.fields,layers:d.layers,annotationObjects:d.objects||[],drag:d.drag?{axis:d.drag.axis,hasExplain:typeof d.drag.explain==='function'}:null}))},null,2));
