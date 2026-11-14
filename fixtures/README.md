# fixtures — contract-valid sample data for development and tests
`manifest.json` + `directory_v1.json` (and its `.gz` built by `scripts/make_fixture_gz.py`) follow
`ref/REF_app_api_contract.md` §2 exactly. They hold a handful of monasteries with INVENTED phones/e-mails
(never real contact data here — real data arrives only through the keyed export). `live-status.json` and
`articles.json` stand in for the live endpoints. When the site's export exists (NEXT.md R-1 = DONE),
refresh the fixtures from a real sample through CD, keeping phones masked.
`views.json` (cloud_22, A-65 / R-38): the eye of `GET <path>/views` keyed by the contract path - 2869 = 42, the live answer of 08.11.2026; 2871 = null (below 40).
`articles_video_r47.json` (cloud_31, R-47 / A-101): the live `GET articles/<id>?lang=` of 1682 (Facebook video, body + gallery) and 1892 (YouTube video, body null) x3 languages, 14.11.2026, one request each; `articles_video.json` keeps 1892 in its 1.0.6 shape (no `video`) on purpose - the old saved copy. `views.json` `__week` = `views_week` per id for the R-48 sorts (absent = 0).
