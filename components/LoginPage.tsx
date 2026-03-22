import { useState, useEffect, useRef, useCallback } from "react";
import { Search, ArrowRight, X } from "lucide-react";
import { getLastSchool, saveLastSchool } from "../lib/school-storage";
import { capture, getAnonDistinctId } from "../lib/posthog";

export interface School {
  id: string;
  name: string;
  url: string;
}

interface LoginPageProps {
  schools: School[];
}

export function LoginPage({ schools }: LoginPageProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [lastSchool, setLastSchool] = useState(getLastSchool());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get logo URL at render time when browser context is available
  const logoUrl = browser.runtime.getURL("/assets/logo-transparent.png");

  // Filter schools based on query
  const filteredSchools = query
    ? schools.filter((school) =>
        school.name.toLowerCase().includes(query.toLowerCase())
      )
    : schools;

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  // Auto-focus search input (but not if there's a last school)
  useEffect(() => {
    if (!lastSchool) {
      inputRef.current?.focus();
    }
  }, [lastSchool]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredSchools.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        const school = filteredSchools[selectedIndex];
        if (school) {
          handleSchoolSelect(school);
        }
      } else if (e.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
    },
    [filteredSchools, selectedIndex]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedElement = listRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Convert default.aspx URL to skemany.aspx
  const getScheduleUrl = (url: string) => {
    return url.replace("default.aspx", "skemany.aspx");
  };

  const handleSchoolSelect = (school: School) => {
    saveLastSchool({
      id: school.id,
      name: school.name,
      url: school.url,
    });
    getAnonDistinctId().then(id => capture('user logged in', id, {
      school_id: school.id,
      school_name: school.name,
      method: 'school_selected',
    }));
    window.location.href = getScheduleUrl(school.url);
  };

  const handleContinueToLastSchool = () => {
    if (lastSchool) {
      // Update timestamp
      saveLastSchool(lastSchool);
      getAnonDistinctId().then(id => capture('user logged in', id, {
        school_id: lastSchool.id,
        school_name: lastSchool.name,
        method: 'continue_to_last_school',
      }));
      window.location.href = getScheduleUrl(lastSchool.url);
    }
  };

  // Highlight matching text in school name
  const highlightMatch = (name: string, searchQuery: string) => {
    if (!searchQuery) return name;

    const lowerName = name.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const index = lowerName.indexOf(lowerQuery);

    if (index === -1) return name;

    return (
      <>
        {name.slice(0, index)}
        <span className="bg-[oklch(0.54_0.2_265)]/20 text-[oklch(0.54_0.2_265)] font-medium">
          {name.slice(index, index + searchQuery.length)}
        </span>
        {name.slice(index + searchQuery.length)}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[oklch(0.965_0.003_265)] flex flex-col">
      {/* Header */}
      <header className="pt-12 pb-6">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <img
            src={logoUrl}
            alt="BetterLectio"
            className="h-12 mx-auto mb-4"
          />
          <h1 className="text-2xl font-semibold text-gray-800">
            Vælg skole for at fortsætte
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5">
        {/* Last school card */}
        {lastSchool && (
          <div className="mb-8">
            <button
              onClick={handleContinueToLastSchool}
              className="w-full bg-white border-2 border-[oklch(0.54_0.2_265)] rounded-lg p-6 text-left hover:bg-[oklch(0.54_0.2_265)]/5 transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[oklch(0.54_0.2_265)] font-medium mb-1">
                    Fortsæt til
                  </p>
                  <p className="text-xl font-semibold text-gray-900">
                    {lastSchool.name}
                  </p>
                </div>
                <div className="bg-[oklch(0.54_0.2_265)] text-white p-3 rounded-lg group-hover:bg-[oklch(0.45_0.2_265)] transition-colors">
                  <ArrowRight className="size-5" />
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Divider */}
        {lastSchool && (
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-[oklch(0.965_0.003_265)] text-gray-500">
                Eller vælg en anden skole
              </span>
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="relative mb-4">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <Search className="size-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            placeholder="Søg efter skole..."
            className="w-full h-14 pl-12 pr-12 rounded-lg border-2 border-gray-200 bg-white text-base focus:outline-none focus:border-[oklch(0.54_0.2_265)] focus:ring-2 focus:ring-[oklch(0.54_0.2_265)]/20 transition-all placeholder:text-gray-400"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="size-5" />
            </button>
          )}
        </div>

        {/* Results count */}
        {query && (
          <p className="text-sm text-gray-500 mb-3">
            {filteredSchools.length}{" "}
            {filteredSchools.length === 1 ? "skole" : "skoler"} fundet
          </p>
        )}

        {/* School list */}
        <div
          ref={listRef}
          className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-[60vh] overflow-y-auto"
        >
          {filteredSchools.length > 0 ? (
            filteredSchools.map((school, index) => (
              <button
                key={school.id}
                onClick={() => handleSchoolSelect(school)}
                className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-b-0 transition-colors cursor-pointer ${
                  index === selectedIndex
                    ? "bg-[oklch(0.54_0.2_265)]/10"
                    : "hover:bg-gray-50"
                }`}
              >
                <span className="text-gray-900">
                  {highlightMatch(school.name, query)}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-gray-500">
              Ingen skoler fundet
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-400">
        <a
          href="https://github.com/jonbng/betterlectio"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors cursor-pointer"
        >
          BetterLectio
        </a>
      </footer>
    </div>
  );
}
