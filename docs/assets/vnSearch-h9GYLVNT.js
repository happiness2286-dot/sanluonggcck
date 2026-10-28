import{c}from"./index-DBdSPCvo.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],m=c("RefreshCw",l);function u(e){return e?String(e).normalize("NFC").replace(/\s+/g," ").trim():""}function s(e){return e?String(e).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").normalize("NFC").replace(/\s+/g," ").trim():""}function t(e){return s(e).replace(/[Φφ∅]/g,"φ").toLowerCase()}function p(e,a){const r=u(a);if(!r)return!0;if(!e)return!1;const o=t(e),n=t(r).split(" ").filter(Boolean);return n.length===0?!0:n.every(i=>o.includes(i))}export{m as R,p as m,u as n,s as r};
