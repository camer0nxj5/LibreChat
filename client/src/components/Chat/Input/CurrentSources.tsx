import { memo } from 'react';
import { Clock3 } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useBadgeRowContext } from '~/Providers';
import { useHasAccess } from '~/hooks';
import { badgeAccents } from './accents';
function CurrentSources() {
  const context=useBadgeRowContext();
  const canSearch=useHasAccess({permissionType:PermissionTypes.WEB_SEARCH,permission:Permissions.USE});
  if (!context || (!canSearch && !context.usesClawiQ)) return null;
  const {currentSources,webSearch,advancedSearch}=context;
  return <span data-tooltip="For current/latest questions, remind the model to verify web sources. Enabling also turns on basic Search. It does not force a search."><CheckboxButton
    checked={currentSources.toggleState===true}
    setValue={({value}:{value:boolean|string|number})=>{
      const enabled=value===true;
      currentSources.setToggleState(enabled);
      if(enabled && !context.usesClawiQ){webSearch.setToggleState(true);advancedSearch.setToggleState(false);}
    }}
    label="Check current sources" isCheckedClassName={badgeAccents.blue}
    icon={<Clock3 className="icon-md" aria-hidden="true" />}
  /></span>;
}
export default memo(CurrentSources);
