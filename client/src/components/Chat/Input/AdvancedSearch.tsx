import React, { memo } from 'react';
import { SearchCheck } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function AdvancedSearch() {
  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const context = useBadgeRowContext();
  if (!canUseWebSearch || !context) return null;

  const { advancedSearch, webSearch } = context;
  const enabled = advancedSearch.toggleState === true;
  const setValue = ({ value }: { value: boolean | string | number }) => {
    advancedSearch.setEphemeralAgent((prev) => ({
      ...(prev || {}),
      advanced_search: value === true,
      web_search: false,
    }));
    if (value === true) webSearch.setToggleState(false);
  };

  return (
    (advancedSearch.isPinned || enabled) && (
      <CheckboxButton
        checked={enabled}
        setValue={setValue}
        label="Advanced Search"
        isCheckedClassName={badgeAccents.blue}
        icon={<SearchCheck className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(AdvancedSearch);
