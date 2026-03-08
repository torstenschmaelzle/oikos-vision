import { motion } from "framer-motion";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-secondary to-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg text-center space-y-4"
      >
        <div className="mx-auto w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
          <SettingsIcon className="w-7 h-7 text-primary-foreground" />
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm">
          This page is under construction. Settings and administration features will appear here.
        </p>
      </motion.div>
    </div>
  );
}
