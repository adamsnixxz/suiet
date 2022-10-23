import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import storage from './storage';

export interface AppContextState {
  initialized: boolean;
  authed: boolean;
  biometricSetuped: boolean | undefined; // undefined for undetermined
  biometricDismissed: boolean;
  walletId: string;
  accountId: string;
  networkId: string;
}

const initialState: AppContextState = {
  initialized: false,
  authed: false,
  biometricSetuped: undefined,
  biometricDismissed: false,
  walletId: '',
  accountId: '',
  networkId: '',
};

// thunks
export const resetAppContext = createAsyncThunk(
  'appContext/reset',
  async (_, thunkApi) => {
    // memory clear
    await thunkApi.dispatch(updateInitialized(false));
    await thunkApi.dispatch(updateAuthed(false));
    await thunkApi.dispatch(updateAccountId(''));
    await thunkApi.dispatch(updateWalletId(''));
    await thunkApi.dispatch(updateNetworkId(''));
    await storage.clear();
  }
);

export const appContextSlice = createSlice({
  name: 'appContext',
  initialState,
  reducers: {
    updateInitialized(state, action: PayloadAction<boolean>) {
      state.initialized = action.payload;
    },
    updateAuthed(state, action: PayloadAction<boolean>) {
      state.authed = action.payload;
    },
    updateBiometricSetuped(state, action: PayloadAction<boolean>) {
      state.biometricSetuped = action.payload;
    },
    updateBiometricDismissed(state, action: PayloadAction<boolean>) {
      state.biometricDismissed = action.payload;
    },
    updateWalletId(state, action: PayloadAction<string>) {
      state.walletId = action.payload;
    },
    updateAccountId(state, action: PayloadAction<string>) {
      state.accountId = action.payload;
    },
    updateNetworkId(state, action: PayloadAction<string>) {
      state.networkId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAppContext.fulfilled, () => {});
  },
});

export const {
  updateInitialized,
  updateAuthed,
  updateBiometricSetuped,
  updateBiometricDismissed,
  updateWalletId,
  updateAccountId,
  updateNetworkId,
} = appContextSlice.actions;

export default appContextSlice.reducer;
