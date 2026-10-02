export interface UserProfile {
  id: number;
  name: string;
  telegram_user_id?: number;
  is_admin: boolean;
  is_vip: boolean;
  profile: {
    name?: string;
    gender?: string;
    age?: number;
    height?: number;
    weight?: number;
    goal?: string;
    activity_level?: string;
    training_frequency?: string;
    restrictions?: string;
    diet_preferences?: string;
    is_admin?: boolean;
    is_vip?: boolean;
    [key: string]: any;
  };
  created_at?: string;
  messages_count?: number;
}

const DEFAULT_USERS: UserProfile[] = [
  {
    id: 1,
    name: "Денис (Главный тренер)",
    telegram_user_id: 435297513,
    is_admin: true,
    is_vip: true,
    profile: {
      name: "Денис",
      telegram_username: "denis_trainer",
      gender: "male",
      role: "admin",
      is_admin: true,
      is_vip: true,
      goal: "Главный тренер и методист",
      activity_level: "Высокая"
    },
    created_at: new Date().toISOString(),
    messages_count: 8
  },
  {
    id: 2,
    name: "Олег (Администратор)",
    telegram_user_id: 747600306,
    is_admin: true,
    is_vip: true,
    profile: {
      name: "Олег",
      telegram_username: "oleg_admin",
      gender: "male",
      role: "admin",
      is_admin: true,
      is_vip: true,
      goal: "Администрирование и развитие системы",
      activity_level: "Умеренная"
    },
    created_at: new Date().toISOString(),
    messages_count: 5
  },
  {
    id: 3,
    name: "Алексей",
    telegram_user_id: 200000001,
    is_admin: false,
    is_vip: true,
    profile: {
      name: "Алексей",
      telegram_username: "alex_power",
      gender: "male",
      role: "vip",
      is_admin: false,
      is_vip: true,
      age: 32,
      height: 182,
      weight: 85,
      goal: "Набор мышечной массы",
      activity_level: "Высокая",
      training_frequency: "4 раза в неделю"
    },
    created_at: new Date().toISOString(),
    messages_count: 2
  },
  {
    id: 4,
    name: "Елена",
    telegram_user_id: 200000002,
    is_admin: false,
    is_vip: false,
    profile: {
      name: "Елена",
      telegram_username: "elena_fitness",
      gender: "female",
      role: "subscriber",
      is_admin: false,
      is_vip: false,
      age: 27,
      height: 168,
      weight: 58,
      goal: "Снижение жировой массы",
      activity_level: "Умеренная",
      training_frequency: "3 раза в неделю"
    },
    created_at: new Date().toISOString(),
    messages_count: 1
  }
];

export function getLocalUsers(): UserProfile[] {
  try {
    const raw = localStorage.getItem('trainer_local_users');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  saveLocalUsers(DEFAULT_USERS);
  return DEFAULT_USERS;
}

export function saveLocalUsers(users: UserProfile[]): void {
  try {
    localStorage.setItem('trainer_local_users', JSON.stringify(users));
  } catch {}
}

export function saveLocalUser(profileData: Partial<UserProfile>): UserProfile {
  const users = getLocalUsers();
  const id = profileData.id || profileData.telegram_user_id || 1;
  const existingIdx = users.findIndex(u => u.id === id || (profileData.telegram_user_id && u.telegram_user_id === profileData.telegram_user_id));
  
  const updatedUser: UserProfile = {
    id: id,
    name: profileData.name || (profileData.profile && profileData.profile.name) || `Пользователь ${id}`,
    telegram_user_id: profileData.telegram_user_id || id,
    is_admin: Boolean(profileData.is_admin || (profileData.profile && profileData.profile.is_admin)),
    is_vip: Boolean(profileData.is_vip || (profileData.profile && profileData.profile.is_vip)),
    profile: {
      ...(existingIdx >= 0 ? users[existingIdx].profile : {}),
      ...(profileData.profile || profileData)
    },
    created_at: existingIdx >= 0 ? users[existingIdx].created_at : new Date().toISOString(),
    messages_count: existingIdx >= 0 ? (users[existingIdx].messages_count || 0) : 0
  };

  if (existingIdx >= 0) {
    users[existingIdx] = updatedUser;
  } else {
    users.unshift(updatedUser);
  }
  saveLocalUsers(users);
  return updatedUser;
}
