/** Empty portfolios must persist too; initialization and sign-out must not. */
export function shouldPersistPortfolio(state: { signedIn: boolean; checking: boolean; skip: boolean }) {
  return state.signedIn && !state.checking && !state.skip;
}
