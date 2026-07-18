// Chooses the backend: the serverless API (Neon-backed) when VITE_API_URL is
// configured, otherwise the bundled demo backend so the game is playable as a
// preview with no server.
import * as http from './http-backend.mjs';
import * as demo from './demo-backend.mjs';

export const isDemo = !import.meta.env?.VITE_API_URL;

const backend = isDemo ? demo : http;

export const getPuzzle = backend.getPuzzle;
export const searchPlayers = backend.searchPlayers;
export const checkGuess = backend.checkGuess;
export const recordEvent = backend.recordEvent;
