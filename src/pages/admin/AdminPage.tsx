import { Images, Palette, Plug, Users } from "lucide-react";
import type { Photo, SiteSettings, User } from "../../types";
import { navigate, type AdminTab } from "../../lib/router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { CustomizeTab } from "./CustomizeTab";
import { PhotosTab } from "./PhotosTab";
import { UsersTab } from "./UsersTab";
import { IntegrationsTab } from "./IntegrationsTab";

const TABS: Array<{ value: AdminTab; label: string; icon: React.ReactNode }> = [
  { value: "customize", label: "Site customization", icon: <Palette size={16} /> },
  { value: "photos", label: "Photos", icon: <Images size={16} /> },
  { value: "users", label: "User management", icon: <Users size={16} /> },
  { value: "integrations", label: "Integrations", icon: <Plug size={16} /> },
];

export function AdminPage({ tab, currentUser, settings, setSettings, photos, onSettingsChanged, onPhotosChanged, onLiveDataChanged }: {
  tab: AdminTab;
  currentUser: User;
  settings: SiteSettings;
  setSettings: React.Dispatch<React.SetStateAction<SiteSettings>>;
  photos: Photo[];
  onSettingsChanged: () => Promise<void>;
  onPhotosChanged: () => Promise<void>;
  onLiveDataChanged: () => Promise<void>;
}) {
  return (
    <div className="admin-page">
      <header className="page-header">
        <h1>Admin</h1>
        <p>Customize the site, manage photos and people, and connect live data.</p>
      </header>
      <Tabs value={tab} onValueChange={(value) => navigate({ page: "admin", tab: value as AdminTab })} activationMode="manual">
        <TabsList aria-label="Admin sections">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>{item.icon}<span>{item.label}</span></TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="customize" forceMount>
          <CustomizeTab settings={settings} setSettings={setSettings} onSaved={onSettingsChanged} />
        </TabsContent>
        <TabsContent value="photos" forceMount>
          <PhotosTab photos={photos} onChanged={onPhotosChanged} />
        </TabsContent>
        <TabsContent value="users" forceMount>
          <UsersTab currentUser={currentUser} />
        </TabsContent>
        <TabsContent value="integrations" forceMount>
          <IntegrationsTab onChanged={onLiveDataChanged} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
