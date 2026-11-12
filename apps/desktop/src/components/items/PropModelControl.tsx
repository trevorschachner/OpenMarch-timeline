/**
 * A prop's 3D model in the prop editor: import a glTF file (.glb or .gltf) to draw the prop as it
 * in the 3D View, replace it, or go back to the plain block, and see the prop in the 3D View.
 * Importing sizes the prop's Outline to the model. Desktop only: the import runs in the main
 * process.
 *
 * A file that can't be imported says why right here, never in a modal (props-spec section 2,
 * "The review").
 */
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import { Button, WarningNote } from "@openmarch/ui";
import type { ModelImportReport } from "@om-electron/main/model-import/types";
import { db } from "@/global/database/db";
import {
    setPropModel,
    type getItems,
    type ImportedModel,
} from "@/db-functions";
import {
    itemGeometryKeys,
    itemKeys,
    propModelsQueryOptions,
} from "@/hooks/queries/useItems";
import { conToastError } from "@/utilities/utils";
import { isWebBuild } from "@/utilities/webBuild";
import { viewPropIn3d } from "@/view3d/sync/view3dFocus";

type ItemWithMarcher = Awaited<ReturnType<typeof getItems>>[number];

/** The reasons a prop model can't be imported, each with its own text. */
const REJECTION_KEYS = new Set([
    "unreadable",
    "validatorErrors",
    "requiredExtension",
    "missingResource",
    "externalUri",
    "resourceOutsideFolder",
    "noGeometry",
    "overTriangleCap",
    "rigNotAllowed",
]);

interface Refusal {
    filename: string;
    codes: string[];
}

const refusalCodes = (report: ModelImportReport | null) => {
    const codes = (report?.cantImport ?? []).map((r) =>
        REJECTION_KEYS.has(r.code) ? r.code : "other",
    );
    return codes.length ? [...new Set(codes)] : ["other"];
};

/**
 * Picks a model file and imports it. Resolves to the model, or to null when the file picker was
 * canceled or the file can't be imported, which `refusal` then says why.
 */
export function usePickPropModel() {
    const { t } = useTranslate();
    const [refusal, setRefusal] = useState<Refusal | null>(null);
    const [busy, setBusy] = useState(false);
    const pick = useCallback(async (): Promise<ImportedModel | null> => {
        setRefusal(null);
        setBusy(true);
        try {
            const result = await window.electron.importPropModel();
            if (result.status === "canceled") return null;
            if (result.status === "rejected") {
                setRefusal({
                    filename: result.filename,
                    codes: refusalCodes(result.report),
                });
                return null;
            }
            return {
                glb: result.glb,
                sidecar: result.sidecar,
                filename: result.filename,
            };
        } catch (e) {
            conToastError(t("props.model.errors.import"), e);
            return null;
        } finally {
            setBusy(false);
        }
    }, [t]);
    return { pick, refusal, busy };
}

/** Why a file can't be a prop model, right where it was picked. */
export function PropModelRefusal({ refusal }: { refusal: Refusal }) {
    const { t } = useTranslate();
    return (
        <WarningNote>
            <span className="font-medium">
                <T
                    keyName="props.model.rejected.title"
                    params={{ filename: refusal.filename }}
                />
            </span>
            <ul className="list-disc pl-16">
                {refusal.codes.map((code) => (
                    <li key={code}>{t(`props.model.rejected.${code}`)}</li>
                ))}
            </ul>
        </WarningNote>
    );
}

export default function PropModelControl({ item }: { item: ItemWithMarcher }) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { data: models } = useQuery(propModelsQueryOptions());
    const { pick, refusal, busy } = usePickPropModel();

    const current = models?.find(
        (m) => m.versionHash === item.library_version_hash,
    );

    const setModel = useMutation({
        mutationFn: (model: ImportedModel | null) =>
            setPropModel({ db, itemId: item.id, model }),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: itemKeys.all() });
            void queryClient.invalidateQueries({
                queryKey: itemGeometryKeys.all(),
            });
        },
        onError: (e) => conToastError(t("props.model.errors.save"), e),
    });

    if (isWebBuild) return null;

    const importModel = async () => {
        const model = await pick();
        if (model) await setModel.mutateAsync(model).catch(() => {});
    };

    return (
        <div className="flex flex-col gap-8 text-sm">
            <span className="text-text/70">
                <T keyName="props.model.label" />
            </span>
            <div className="flex items-center justify-between gap-8">
                <span
                    className="text-text truncate"
                    data-testid="prop-model-name"
                >
                    {current ? (
                        current.name
                    ) : item.library_version_hash ? (
                        <T keyName="props.model.missing" />
                    ) : (
                        <T keyName="props.model.none" />
                    )}
                </span>
                <div className="flex shrink-0 gap-4">
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => viewPropIn3d(item.marcher_id)}
                        data-testid="prop-view-in-3d"
                    >
                        <T keyName="props.model.viewIn3d" />
                    </Button>
                    <Button
                        size="compact"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void importModel()}
                    >
                        {item.library_version_hash
                            ? t("props.model.replace")
                            : t("props.model.import")}
                    </Button>
                    {item.library_version_hash && (
                        <Button
                            size="compact"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setModel.mutate(null)}
                        >
                            <T keyName="props.model.remove" />
                        </Button>
                    )}
                </div>
            </div>
            {refusal && <PropModelRefusal refusal={refusal} />}
            {!refusal && !item.library_version_hash && (
                <span className="text-text/50 text-sub">
                    <T keyName="props.model.hint" />
                </span>
            )}
        </div>
    );
}
