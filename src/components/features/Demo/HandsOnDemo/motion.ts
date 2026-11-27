// 体験デモの動き。名前は「hod」で始め、ほかの画面の動きと重ならないようにする。
// 動きを減らす設定の利用者には、どの動きも最後の状態だけを見せる。

/** 体験デモの一番外側に付ける属性。動きを減らす設定の対象をこの中に限る。 */
export const HANDS_ON_ROOT_ATTRIBUTE = "data-hands-on-demo";

export const HANDS_ON_KEYFRAMES = `
@keyframes hodPop { 0% { transform: scale(.3); opacity: 0 } 70% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes hodFadeUp { 0% { transform: translateY(10px); opacity: 0 } 100% { transform: none; opacity: 1 } }
@keyframes hodSceneIn { 0% { opacity: 0; transform: scale(.985) } 100% { opacity: 1; transform: none } }
@keyframes hodFall { 0% { transform: translate3d(0,-12vh,0) rotate(0deg) } 100% { transform: translate3d(var(--drift),112vh,0) rotate(var(--spin)) } }
@keyframes hodBurst { 0% { transform: translate(0, 0) rotate(0deg) scale(.3); opacity: 1 } 55% { transform: translate(var(--dx), var(--dy)) rotate(var(--spin)) scale(1); opacity: 1 } 100% { transform: translate(calc(var(--dx) * 1.15), calc(var(--dy) + 280px)) rotate(calc(var(--spin) * 1.6)) scale(1); opacity: 0 } }
@keyframes hodHalo { 0% { box-shadow: 0 0 0 0 rgba(13,148,136,.45), 0 0 0 0 rgba(13,148,136,.25) } 70% { box-shadow: 0 0 0 16px rgba(13,148,136,0), 0 0 0 32px rgba(13,148,136,0) } 100% { box-shadow: 0 0 0 0 rgba(13,148,136,0), 0 0 0 0 rgba(13,148,136,0) } }
@keyframes hodBreath { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.035) } }
@keyframes hodShine { 0% { transform: translateX(-180%) skewX(-20deg) } 55%, 100% { transform: translateX(320%) skewX(-20deg) } }
@keyframes hodArcX { 0% { transform: translateX(0); opacity: 0 } 8% { opacity: 1 } 92% { opacity: 1 } 100% { transform: translateX(var(--travel)); opacity: 0 } }
@keyframes hodArcXBack { 0% { transform: translateX(var(--travel)); opacity: 0 } 8% { opacity: 1 } 92% { opacity: 1 } 100% { transform: translateX(0); opacity: 0 } }
@keyframes hodArcY { 0% { transform: translateY(0); animation-timing-function: cubic-bezier(.215,.61,.355,1) } 50% { transform: translateY(-64px); animation-timing-function: cubic-bezier(.55,.055,.675,.19) } 100% { transform: translateY(0) } }
@keyframes hodTapHand { 0%, 100% { transform: translate(14px, 12px) } 40% { transform: translate(0, 0) } 50% { transform: translate(0, 0) scale(.86) } 62% { transform: translate(0, 0) scale(1) } 80% { transform: translate(14px, 12px) } }
@keyframes hodTapRipple { 0%, 44% { transform: scale(.3); opacity: 0 } 50% { opacity: .85 } 80%, 100% { transform: scale(2.6); opacity: 0 } }
@keyframes hodRippleOnce { 0% { transform: scale(.3); opacity: .9 } 100% { transform: scale(2.6); opacity: 0 } }
@keyframes hodArrive { 0% { opacity: 0; transform: translateX(-40px) } 100% { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  [${HANDS_ON_ROOT_ATTRIBUTE}] *, [${HANDS_ON_ROOT_ATTRIBUTE}] *::before, [${HANDS_ON_ROOT_ATTRIBUTE}] *::after {
    animation-duration: .001s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
  }
}
`;
