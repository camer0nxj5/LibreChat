import React, { memo } from 'react';
import { Globe } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function WebSearch() {
  const localize = useLocalize();
  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const context = useBadgeRowContext();
  if (!canUseWebSearch) {
    return null;
  }
  if (!context) {
    return null;
  }
  const { webSearch: webSearchData, advancedSearch, searchApiKeyForm } = context;
  const { toggleState: webSearch, isPinned, authData } = webSearchData;
  const { badgeTriggerRef } = searchApiKeyForm;

  const setRegularSearch = ({ value }: { value: boolean | string | number }) => {
    webSearchData.setEphemeralAgent((prev) => ({
      ...(prev || {}),
      web_search: value === true,
      advanced_search: false,
    }));
    if (value === true) advancedSearch.setToggleState(false);
  };

  return (
    (isPinned || (webSearch && authData?.authenticated)) && (
      <CheckboxButton
        ref={badgeTriggerRef}
        checked={webSearch}
        setValue={setRegularSearch}
        label={localize('com_ui_search')}
        isCheckedClassName={badgeAccents.blue}
        icon={<Globe className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(WebSearch);
