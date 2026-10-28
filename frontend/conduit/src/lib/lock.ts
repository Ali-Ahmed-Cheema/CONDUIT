import { writeVault } from "../crypto/vault";
import { useAppStore } from "../store";

export async function lockApp() {
  const state = useAppStore.getState();
  if (state.dataKey) {
    try {
      await writeVault(state.dataKey, {
        chats: state.conversations,
        settings: {
          theme: state.theme,
          soundOn: state.soundOn,
          autoLockMinutes: state.autoLockMinutes,
        },
      });
      state.setVaultError(null);
    } catch (error) {
      state.setVaultError(error instanceof Error ? `Could not save encrypted local data: ${error.message}` : "Could not save encrypted local data.");
      return;
    }
  }
  state.setDataKey(null);
  state.setUnlocked(false);
}
