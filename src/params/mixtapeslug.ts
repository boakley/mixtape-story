import { isValidMixtapeSlug } from '$lib/mixtapes/slug';
import type { ParamMatcher } from '@sveltejs/kit';

// Route matcher for /{handle}/[[slug=mixtapeslug]]. Rejecting
// `_`-prefixed and reserved values here is what lets the optional
// param coexist with literal system segments: /{handle}/_edit can't
// match [[slug]], so it resolves as slug-absent + the literal route.
export const match: ParamMatcher = (param) => isValidMixtapeSlug(param);
