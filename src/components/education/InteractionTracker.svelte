<script lang="ts">
  import { db } from '$lib/db/schema';

  interface Props {
    contentSlug: string;
  }

  let { contentSlug }: Props = $props();

  $effect(() => {
    const startTime = Date.now();

    // Record the view-start interaction
    const viewId = crypto.randomUUID();
    db.educationInteractions
      .add({
        id: viewId,
        contentSlug,
        action: 'view',
        createdAt: new Date(),
      })
      .catch(() => {
        // Non-critical telemetry — do not surface to user
      });

    // Cleanup: record duration on unmount
    return () => {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      if (durationSeconds < 1) return;

      db.educationInteractions
        .add({
          id: crypto.randomUUID(),
          contentSlug,
          action: 'complete',
          durationSeconds,
          createdAt: new Date(),
        })
        .catch(() => {
          // Non-critical telemetry
        });
    };
  });
</script>

<!-- Renderless component — no visible output -->
