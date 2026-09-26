// Native disclosure works without JavaScript. Only one copy is visible and
// focusable at each breakpoint; desktop keeps its existing contents panel.
export function responsiveContents(contents) {
  return `<div class="responsive-contents"><div class="desktop-contents">${contents}</div><details class="mobile-reading-menu"><summary>On this page</summary>${contents}</details></div>`;
}
