import { useState, useEffect, useRef } from 'preact/hooks';
import { Pin, Trash2, School, DoorOpen, Box, UsersRound, LayoutGrid } from 'lucide-react';
import { fetchPictureUrl, getCachedPictureUrl } from '../lib/findskema-storage';
import { getDisplayNameFromLookupId, getPictureUrlFromLookupId, type StudentsMap } from '@/lib/supabase/student-lookup';
import { browser } from 'wxt/browser';
import { useTranslation } from '@/lib/i18n';

// Type configuration for badge display
const TYPE_CONFIG: Record<string, { badgeClass: string }> = {
  S: { badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  T: { badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  K: { badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  L: { badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  R: { badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300' },
  H: { badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' },
  G: { badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
};

const TYPE_LABEL_KEY: Record<string, string> = {
  S: 'personSearch.types.student',
  T: 'personSearch.types.teacher',
  K: 'personSearch.types.class',
  L: 'personSearch.types.room',
  R: 'personSearch.types.resource',
  H: 'personSearch.types.hold',
  G: 'personSearch.types.group',
};

// Icons for entity types (non-person)
const TYPE_ICONS: Record<string, typeof School> = {
  K: School,
  L: DoorOpen,
  R: Box,
  H: UsersRound,
  G: LayoutGrid,
};

// Entity type accent border colors
const ENTITY_BORDER: Record<string, string> = {
  K: 'border-l-[3px] border-l-[oklch(0.63_0.18_295)]',
  L: 'border-l-[3px] border-l-[oklch(0.7_0.16_55)]',
  R: 'border-l-[3px] border-l-[oklch(0.65_0.2_350)]',
  H: 'border-l-[3px] border-l-[oklch(0.7_0.14_200)]',
  G: 'border-l-[3px] border-l-[oklch(0.75_0.14_85)]',
};

// Types that typically have pictures
const TYPES_WITH_PICTURES = ['S', 'T'];

interface PersonCardProps {
  id: string;
  name: string;
  classCode: string;
  type: string;
  href: string;
  isStarred: boolean;
  onStarToggle: (id: string) => void;
  showPinButton?: boolean;
  onRemove?: (id: string) => void;
  onClick?: () => void;
  schoolId: string;
  searchQuery?: string; // If provided, adds from=findskema&q= to href for back navigation
  hasBetterLectio?: boolean; // Show BetterLectio badge on student cards
  studentsMap?: StudentsMap | null;
}

export function PersonCard({
  id,
  name,
  classCode,
  type,
  href,
  isStarred,
  onStarToggle,
  showPinButton = true,
  onRemove,
  onClick,
  schoolId,
  searchQuery,
  hasBetterLectio,
  studentsMap,
}: PersonCardProps) {
  const { t } = useTranslation();
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.S;
  const typeLabel = t((TYPE_LABEL_KEY[type] || 'personSearch.types.student') as Parameters<typeof t>[0]);
  const isEntityCard = !TYPES_WITH_PICTURES.includes(type);
  const EntityIcon = TYPE_ICONS[type];
  const displayName = getDisplayNameFromLookupId(studentsMap, id, name);

  // Build href with navigation context (for back button on schedule page)
  // and preserve entity name for robust header extraction on destination pages.
  const targetUrl = new URL(href, window.location.origin);
  targetUrl.searchParams.set('from', 'findskema');
  targetUrl.searchParams.set('name', displayName);
  if (searchQuery) {
    targetUrl.searchParams.set('q', searchQuery);
  }
  const fullHref = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map(n => n.charAt(0))
    .join('')
    .toUpperCase();

  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [pictureLoaded, setPictureLoaded] = useState(false);
  const [pictureError, setPictureError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const hasFetchedRef = useRef(false);
  const preferredPictureUrl = getPictureUrlFromLookupId(studentsMap, id);

  useEffect(() => {
    setPictureLoaded(false);
    setPictureError(false);

    if (isEntityCard) {
      setPictureUrl(null);
      hasFetchedRef.current = true;
      return;
    }

    if (preferredPictureUrl) {
      setPictureUrl(preferredPictureUrl);
      hasFetchedRef.current = true;
      return;
    }

    setPictureUrl(null);
    hasFetchedRef.current = false;
  }, [id, isEntityCard, preferredPictureUrl]);

  // Load picture - check cache first, then fetch if visible
  useEffect(() => {
    if (isEntityCard) {
      setPictureError(true); // Show initials for non-picture types
      return;
    }

    if (preferredPictureUrl) {
      return;
    }

    // Check cache first
    const cached = getCachedPictureUrl(id);
    if (cached !== undefined) {
      if (cached === null) {
        setPictureError(true); // No picture available
      } else {
        setPictureUrl(cached);
      }
      hasFetchedRef.current = true;
      return; // Already have cached data, no need for observer
    }

    const loadPicture = async () => {
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;

      const url = await fetchPictureUrl(id, schoolId);
      if (url) {
        setPictureUrl(url);
      } else {
        setPictureError(true);
      }
    };

    // Use requestAnimationFrame to ensure DOM is rendered before checking visibility
    const rafId = requestAnimationFrame(() => {
      if (hasFetchedRef.current) return;

      // Check if already visible
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight + 100 && rect.bottom > -100;
        if (isVisible) {
          loadPicture();
          return;
        }
      }

      // Set up observer for lazy loading
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting && !hasFetchedRef.current) {
            observer.disconnect();
            loadPicture();
          }
        },
        { rootMargin: '100px', threshold: 0 }
      );

      if (cardRef.current) {
        observer.observe(cardRef.current);
      }

      // Store observer reference for cleanup
      (cardRef as any)._observer = observer;
    });

    return () => {
      cancelAnimationFrame(rafId);
      const observer = (cardRef as any)._observer;
      if (observer) {
        observer.disconnect();
        (cardRef as any)._observer = null;
      }
    };
  }, [id, schoolId, type, isEntityCard, preferredPictureUrl]);

  const handleStarClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onStarToggle(id);
  };

  const handleRemoveClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.(id);
  };

  const handleImageLoad = () => {
    setPictureLoaded(true);
  };

  const handleImageError = () => {
    setPictureError(true);
  };

  const navigateToCard = () => {
    onClick?.();
    window.location.href = fullHref;
  };

  const handleCardClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-card-actions]')) return;
    navigateToCard();
  };

  const handleCardKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    navigateToCard();
  };

  // Show fallback if: no URL yet, error loading, or image hasn't loaded
  const showFallback = !pictureUrl || pictureError || !pictureLoaded;

  // Action buttons (shared between entity and person cards)
  const hasActions = Boolean(onRemove || showPinButton);

  const actionButtons = hasActions ? (
    <div
      data-card-actions
      className={`absolute top-2 right-2 flex flex-col gap-1 transition-opacity duration-200 ${
        isStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      {onRemove && (
        <button
          type="button"
          onClick={handleRemoveClick}
          className="p-2 rounded-full bg-[oklch(1_0_0/0.9)] backdrop-blur-sm text-muted-foreground shadow-[0_2px_8px_oklch(0_0_0/0.1)] hover:bg-white hover:text-destructive hover:scale-110 transition-all duration-150"
          title={t('personSearch.removeFromRecent')}
        >
          <Trash2 className="size-4" />
        </button>
      )}
      {showPinButton && (
        <button
          type="button"
          onClick={handleStarClick}
          className={`p-2 rounded-full backdrop-blur-sm shadow-[0_2px_8px_oklch(0_0_0/0.1)] hover:scale-110 transition-all duration-150 ${
            isStarred
              ? 'bg-white text-primary'
              : 'bg-[oklch(1_0_0/0.9)] text-muted-foreground hover:bg-white hover:text-primary'
          }`}
          title={isStarred ? t('viewingSchedule.unpinPerson') : t('viewingSchedule.pinPerson')}
        >
          <Pin className="size-5" fill={isStarred ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  ) : null;

  // Entity card layout (classes, rooms, resources, hold, groups)
  if (isEntityCard) {
    return (
      <div
        ref={cardRef}
        role="link"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
      aria-label={t('personSearch.openScheduleFor', { name: displayName })}
      className={`group flex flex-col rounded-xl border border-border bg-card cursor-pointer transition-[background-color,border-color] duration-150 no-underline text-inherit overflow-hidden hover:border-ring hover:bg-accent/20 relative aspect-square p-4 justify-end ${ENTITY_BORDER[type] || ''}`}
      >
        {/* Decorative background icon */}
        {EntityIcon && (
          <EntityIcon
            className="absolute -top-[10%] -right-[10%] w-[70%] h-[70%] text-foreground opacity-5 transition-all duration-300 pointer-events-none group-hover:opacity-[0.09] group-hover:scale-105 group-hover:-rotate-3"
            strokeWidth={1}
          />
        )}

        {actionButtons}

        {/* Entity content */}
        <div className="relative flex flex-col gap-2 z-[1]">
          <span className="text-xl font-bold text-foreground leading-tight -tracking-[0.01em]">{displayName}</span>
          <span className={`self-start text-xs font-semibold px-2 py-0.5 rounded-full ${config.badgeClass}`}>
            {typeLabel}
          </span>
        </div>
      </div>
    );
  }

  // Person card layout (students, teachers)
  return (
    <div
      ref={cardRef}
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={t('personSearch.openScheduleFor', { name: displayName })}
      className="group flex flex-col rounded-xl border border-border bg-card cursor-pointer transition-[background-color,border-color] duration-150 no-underline text-inherit overflow-hidden hover:border-ring hover:bg-accent/20"
    >
      {/* Large image at top */}
      <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
        {pictureUrl && !pictureError && (
          <img
            src={pictureUrl}
            alt={displayName}
            className={`w-full h-full object-cover object-top transition-all duration-300 ease-out ${
              pictureLoaded ? 'opacity-100 group-hover:scale-105' : 'opacity-0'
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
        <div className={`absolute inset-0 flex items-center justify-center text-[2.5rem] font-semibold text-muted-foreground bg-muted ${showFallback ? '' : 'hidden'}`}>
          {initials}
        </div>

        {actionButtons}

        {/* BetterLectio badge */}
        {hasBetterLectio && (
          <img
            src={browser.runtime.getURL('/assets/logo-rounded.svg')}
            alt="BetterLectio"
            className="absolute bottom-2 right-2 size-9 drop-shadow-[0_2px_4px_oklch(0_0_0/0.25)]"
          />
        )}
      </div>

      {/* Card content below image */}
      <div className="p-3.5 flex flex-col gap-1.5">
        <span className="text-[0.9375rem] font-semibold text-foreground leading-[1.3] line-clamp-2">{displayName}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {classCode && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {classCode.split(' ')[0]}
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.badgeClass}`}>
            {typeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
