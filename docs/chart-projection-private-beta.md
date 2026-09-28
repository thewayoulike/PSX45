# Chart projection private beta

Release scope: only the verified, active account `itruth2011@gmail.com` receives `features.chartProjection` from the existing account-access endpoint. The application binds that response to the active account. Missing flags, signed-out/public previews, pending accounts and account mismatches default to disabled. The chart calculation worker starts only after the eligible user switches the feature on. No new endpoint, database table or external AI request is needed.

## Included behavior

- Optional daily closing-price ranges at 1, 3, 5 or 8 trading sessions, within the existing chart.
- Candle patterns, recent prices, moving averages, oscillators, trend, volatility and volume inform comparable historical setups.
- Paired historical checks select the indicator model only when it improves both median error and interval score over the baseline. Those checks select the model; they do not independently establish future accuracy.
- Saving freezes the reference candle, capture time, values, inputs and model diagnostics. Subsequent completed closes are compared with the frozen record.
- Records save locally and participate in the existing connected Drive backup. The UI distinguishes local save from confirmed cloud sync.
- Private-beta and illustrative-range labels; the investment-advice disclaimer remains visible.

## Validation

Production build and type checking passed. The full existing suite plus projection, storage, server eligibility and response-binding tests passed (587 tests); the additional three default-deny/account-switch context tests passed separately. The ordinary-account chart preview shows no projection controls or saved-projection panel. No real portfolio or Drive backup was changed in testing.

The single-stock AIRLINK historical evaluation only marginally favored indicator matching at one session and retained the baseline at 3, 5 and 8 sessions. It does not establish a general accuracy improvement. Wider-market and physical Android-device evaluation remain beta work.

## Release and rollback

Deploy through the existing production branch. This is an account-specific feature rollout, not a promise that browser-delivered calculation code is confidential. To withdraw the beta, return `chartProjection: false` from the access endpoint; the next access check hides the UI and stops calculations. Saved records remain intact for later use.

The ignored `.audit-tools` previews and untracked uploaded prototype are excluded from the release commit.
