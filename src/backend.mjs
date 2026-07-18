// Chooses the backend: the real Supabase RPCs when configured, otherwise the
// bundled demo backend so the game is playable as a preview with no server.
import { supabase } from './supabase.mjs';
import * as real from './api.mjs';
import * as demo from './demo-backend.mjs';

export const isDemo = !supabase;

const backend = isDemo ? demo : real;

export const getPuzzle = backend.getPuzzle;
export const searchPlayers = backend.searchPlayers;
export const checkGuess = backend.checkGuess;
export const recordEvent = backend.recordEvent;
