import { DashboardModel, PanelModel } from '../../../state';
import { ThunkResult } from 'app/types';
import {
  closeEditor,
  PANEL_EDITOR_UI_STATE_STORAGE_KEY,
  PanelEditorUIState,
  setPanelEditorUIState,
  updateEditorInitState,
  setDiscardChanges,
} from './reducers';
import { cleanUpEditPanel, panelModelAndPluginReady } from '../../../state/reducers';
import store from 'app/core/store';
import { pick } from 'lodash';

export function initPanelEditor(sourcePanel: PanelModel, dashboard: DashboardModel): ThunkResult<void> {
  return (dispatch) => {
    const panel = dashboard.initEditPanel(sourcePanel);

    dispatch(
      updateEditorInitState({
        panel,
        sourcePanel,
      })
    );
  };
}

export function discardPanelChanges(): ThunkResult<void> {
  return async (dispatch, getStore) => {
    const { getPanel } = getStore().panelEditor;
    getPanel().configRev = 0;
    dispatch(setDiscardChanges(true));
  };
}

function updateDuplicateLibraryPanels(modifiedPanel: PanelModel, dashboard: DashboardModel | null, dispatch: any) {
  if (modifiedPanel.libraryPanel?.uid === undefined || !dashboard) {
    return;
  }

  const modifiedSaveModel = modifiedPanel.getSaveModel();
  for (const panel of dashboard.panels) {
    if (panel.libraryPanel?.uid !== modifiedPanel.libraryPanel!.uid) {
      continue;
    }

    panel.restoreModel({
      ...modifiedSaveModel,
      ...pick(panel, 'gridPos', 'id'),
    });

    // Loaded plugin is not included in the persisted properties
    // So is not handled by restoreModel
    const pluginChanged = panel.plugin?.meta.id !== modifiedPanel.plugin?.meta.id;
    panel.plugin = modifiedPanel.plugin;
    panel.configRev++;

    if (pluginChanged) {
      dispatch(panelModelAndPluginReady({ panelId: panel.id, plugin: panel.plugin! }));
    }

    // Resend last query result on source panel query runner
    // But do this after the panel edit editor exit process has completed
    setTimeout(() => {
      panel.getQueryRunner().useLastResultFrom(modifiedPanel.getQueryRunner());
    }, 20);
  }
}

export function exitPanelEditor(): ThunkResult<void> {
  return async (dispatch, getStore) => {
    const dashboard = getStore().dashboard.getModel();
    const { getPanel, getSourcePanel, shouldDiscardChanges } = getStore().panelEditor;

    if (!shouldDiscardChanges) {
      const panel = getPanel();
      const modifiedSaveModel = panel.getSaveModel();
      const sourcePanel = getSourcePanel();
      const panelTypeChanged = sourcePanel.type !== panel.type;

      updateDuplicateLibraryPanels(panel, dashboard, dispatch);

      // restore the source panel ID before we update source panel
      modifiedSaveModel.id = sourcePanel.id;

      sourcePanel.restoreModel(modifiedSaveModel);
      sourcePanel.configRev++; // force check the configs

      // Loaded plugin is not included in the persisted properties
      // So is not handled by restoreModel
      sourcePanel.plugin = panel.plugin;

      if (panelTypeChanged) {
        await dispatch(panelModelAndPluginReady({ panelId: sourcePanel.id, plugin: panel.plugin! }));
      }

      // Resend last query result on source panel query runner
      // But do this after the panel edit editor exit process has completed
      setTimeout(() => {
        sourcePanel.getQueryRunner().useLastResultFrom(panel.getQueryRunner());
      }, 20);
    }

    if (dashboard) {
      dashboard.exitPanelEditor();
    }

    dispatch(closeEditor());
    dispatch(cleanUpEditPanel());
  };
}

export function updatePanelEditorUIState(uiState: Partial<PanelEditorUIState>): ThunkResult<void> {
  return (dispatch, getStore) => {
    const nextState = { ...getStore().panelEditor.ui, ...uiState };
    dispatch(setPanelEditorUIState(nextState));
    try {
      store.setObject(PANEL_EDITOR_UI_STATE_STORAGE_KEY, nextState);
    } catch (error) {
      console.error(error);
    }
  };
}
