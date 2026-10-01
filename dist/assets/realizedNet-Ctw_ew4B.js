function n(t){return t.reduce((r,e)=>r+e.profit-(e.eventType?0:e.tax||0),0)}export{n as r};
