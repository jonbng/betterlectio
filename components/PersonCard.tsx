import { useState, useEffect, useRef } from 'preact/hooks';
import { Star, Trash2, School, DoorOpen, Box, UsersRound, LayoutGrid } from 'lucide-react';
import { fetchPictureUrl, getCachedPictureUrl } from '../lib/findskema-storage';

// Type configuration for badge display
const TYPE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  S: { label: 'Elev', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  T: { label: 'Lærer', badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  K: { label: 'Klasse', badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  L: { label: 'Lokale', badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  R: { label: 'Ressource', badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300' },
  H: { label: 'Hold', badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' },
  G: { label: 'Gruppe', badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
};

// Icons for entity types (non-person)
const TYPE_ICONS: Record<string, typeof School> = {
  K: School,
  L: DoorOpen,
  R: Box,
  H: UsersRound,
  G: LayoutGrid,
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
  onRemove?: (id: string) => void;
  onClick?: () => void;
  schoolId: string;
  searchQuery?: string; // If provided, adds from=findskema&q= to href for back navigation
}

export function PersonCard({
  id,
  name,
  classCode,
  type,
  href,
  isStarred,
  onStarToggle,
  onRemove,
  onClick,
  schoolId,
  searchQuery,
}: PersonCardProps) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.S;
  const isEntityCard = !TYPES_WITH_PICTURES.includes(type);
  const EntityIcon = TYPE_ICONS[type];

  // Build href with navigation context (for back button on schedule page)
  // and preserve entity name for robust header extraction on destination pages.
  const targetUrl = new URL(href, window.location.origin);
  targetUrl.searchParams.set('from', 'findskema');
  targetUrl.searchParams.set('name', name);
  if (searchQuery) {
    targetUrl.searchParams.set('q', searchQuery);
  }
  const fullHref = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(n => n.charAt(0))
    .join('')
    .toUpperCase();

  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [pictureLoaded, setPictureLoaded] = useState(false);
  const [pictureError, setPictureError] = useState(false);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const hasFetchedRef = useRef(false);

  // Load picture - check cache first, then fetch if visible
  useEffect(() => {
    if (isEntityCard) {
      setPictureError(true); // Show initials for non-picture types
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
  }, [id, schoolId, type, isEntityCard]);

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

  // Show fallback if: no URL yet, error loading, or image hasn't loaded
  const showFallback = !pictureUrl || pictureError || !pictureLoaded;

  // Entity card layout (classes, rooms, resources, hold, groups)
  if (isEntityCard) {
    return (
      <a
        ref={cardRef}
        href={fullHref}
        onClick={onClick}
        className={`findskema-person-card findskema-entity-card findskema-entity-${type} group`}
      >
        {/* Decorative background icon */}
        {EntityIcon && (
          <EntityIcon className="findskema-entity-bg-icon" strokeWidth={1} />
        )}

        {/* Action buttons */}
        <div className="findskema-card-actions">
          {onRemove && (
            <button
              type="button"
              onClick={handleRemoveClick}
              className="findskema-remove-btn"
              title="Fjern fra seneste"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleStarClick}
            className={`findskema-star-btn ${isStarred ? 'is-starred' : ''}`}
            title={isStarred ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}
          >
            <Star className="size-5" fill={isStarred ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Entity content */}
        <div className="findskema-entity-content">
          <span className="findskema-entity-name">{name}</span>
          <span className={`findskema-card-badge ${config.badgeClass}`}>
            {config.label}
          </span>
        </div>
      </a>
    );
  }

  // Person card layout (students, teachers)
  return (
    <a
      ref={cardRef}
      href={fullHref}
      onClick={onClick}
      className="findskema-person-card group"
    >
      {/* Large image at top */}
      <div className="findskema-card-image-container">
        {pictureUrl && !pictureError && (
          <img
            src={pictureUrl}
            alt={name}
            className={`findskema-card-image ${pictureLoaded ? 'is-loaded' : ''}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
        <div className={`findskema-card-fallback ${showFallback ? '' : 'hidden'}`}>
          {initials}
        </div>

        {/* Action buttons overlay */}
        <div className="findskema-card-actions">
          {onRemove && (
            <button
              type="button"
              onClick={handleRemoveClick}
              className="findskema-remove-btn"
              title="Fjern fra seneste"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleStarClick}
            className={`findskema-star-btn ${isStarred ? 'is-starred' : ''}`}
            title={isStarred ? 'Fjern fra favoritter' : 'Tilføj til favoritter'}
          >
            <Star className="size-5" fill={isStarred ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      {/* Card content below image */}
      <div className="findskema-card-content">
        <span className="findskema-card-name">{name}</span>
        <div className="findskema-card-meta">
          {classCode && (
            <span className="findskema-card-badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {classCode.split(' ')[0]}
            </span>
          )}
          <span className={`findskema-card-badge ${config.badgeClass}`}>
            {config.label}
          </span>
        </div>
      </div>
    </a>
  );
}
