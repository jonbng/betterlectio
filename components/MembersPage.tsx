import { useState, useEffect, useCallback } from 'react';
import { PersonCard } from './PersonCard';
import {
  getStarredPeople,
  toggleStarred,
  isPersonStarred,
  getScheduleUrl,
  addRecentPerson,
  type StarredPerson,
} from '../lib/findskema-storage';
import { getSettings } from '../lib/settings-storage';
import { parseMembersFromDocument, type Member } from '../lib/members-fetch';
import { useSchoolStudents } from '@/lib/supabase/student-lookup';

interface MembersPageProps {
  schoolId: string;
  members: Member[];
}

export function MembersPage({ schoolId, members }: MembersPageProps) {
  const [, setStarred] = useState<StarredPerson[]>([]);
  const pinningEnabled = getSettings().data?.starredPeople ?? false;
  const { studentsMap } = useSchoolStudents(schoolId);

  // Load starred from localStorage
  useEffect(() => {
    setStarred(getStarredPeople());
  }, []);

  // Sort members: teachers first, then students
  const sortedMembers = [...members].sort((a, b) => {
    if (a.type === 'T' && b.type !== 'T') return -1;
    if (a.type !== 'T' && b.type === 'T') return 1;
    return 0;
  });

  // Handle starring
  const handleStarToggle = useCallback((id: string) => {
    const member = members.find(m => m.id === id);
    if (member) {
      const fullName = `${member.firstName} ${member.lastName}`.trim();
      toggleStarred({
        id,
        name: fullName,
        classCode: member.classCode,
        type: member.type,
      });
      setStarred(getStarredPeople());
    }
  }, [members]);

  // Handle card click (add to recents)
  const handleCardClick = useCallback((member: Member) => {
    const fullName = `${member.firstName} ${member.lastName}`.trim();
    addRecentPerson({
      id: member.id,
      name: fullName,
      classCode: member.classCode,
      type: member.type,
      url: getScheduleUrl(member.id, schoolId),
    });
  }, [schoolId]);

  return (
    <div className="findskema-card-grid">
      {sortedMembers.map((member) => {
        const fullName = `${member.firstName} ${member.lastName}`.trim();
        return (
          <PersonCard
            key={member.id}
            id={member.id}
            name={fullName}
            classCode={member.classCode}
            type={member.type}
            href={getScheduleUrl(member.id, schoolId)}
            isStarred={isPersonStarred(member.id)}
            onStarToggle={handleStarToggle}
            showPinButton={pinningEnabled}
            onClick={() => handleCardClick(member)}
            schoolId={schoolId}
            studentsMap={studentsMap}
          />
        );
      })}
    </div>
  );
}

/**
 * Parse members from the Lectio members table (withpics format).
 * Columns: Foto, Type, ID, Fornavn, Efternavn
 */
export function parseMembersFromDOM(): Member[] {
  return parseMembersFromDocument(document);
}
