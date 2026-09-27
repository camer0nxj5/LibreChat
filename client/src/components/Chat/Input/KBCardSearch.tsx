import React, { memo } from 'react';
import { Database } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { badgeAccents } from './accents';

function KBCardSearch() {
  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const context = useBadgeRowContext();
  if (!canUseWebSearch || !context) return null;

  const { kbCards } = context;
  const enabled = kbCards.toggleState === true;

  return (
    (kbCards.isPinned || enabled) && (
      <CheckboxButton
        checked={enabled}
        setValue={({ value }: { value: boolean | string | number }) =>
          kbCards.setToggleState(value === true)
        }
        label="KB Cards"
        isCheckedClassName={badgeAccents.blue}
        icon={<Database className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(KBCardSearch);
