import { IdentityEvidence } from '../types';

// The captured ID photo and selfies, held only in memory between the Identity Verification
// screen and the Sign-up screen that submits them. Never persisted to disk or to Redux (the
// photos are large and sensitive), and cleared as soon as they are submitted or discarded.
let draft: IdentityEvidence | null = null;

export const getIdentityDraft = (): IdentityEvidence | null => draft;
export const setIdentityDraft = (evidence: IdentityEvidence): void => { draft = evidence; };
export const clearIdentityDraft = (): void => { draft = null; };
