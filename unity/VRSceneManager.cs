using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

/// <summary>
/// Gerenciador de Orquestração Espacial para Meta Quest 3 integrado ao VR Room BFF.
/// </summary>
public class VRSceneManager : MonoBehaviour
{
    [Header("Configuração de Rede")]
    [Tooltip("URL base do VR Room BFF")]
    [SerializeField] private string bffBaseUrl = "http://localhost:3000";

    [Header("Catálogo de Prefabs (asset_id -> Prefab)")]
    [SerializeField] private List<AssetEntry> assetCatalog = new List<AssetEntry>();

    [Header("Referências")]
    [SerializeField] private Transform userCamera;

    [System.Serializable]
    public struct AssetEntry
    {
        public string assetId;
        public GameObject prefab;
    }

    // Dicionário de busca rápida
    private Dictionary<string, GameObject> catalogDict = new Dictionary<string, GameObject>();

    // Memória de instâncias ativas na cena: instance_id -> GameObject
    private Dictionary<string, GameObject> activeInstances = new Dictionary<string, GameObject>();

    private void Awake()
    {
        if (userCamera == null && Camera.main != null)
        {
            userCamera = Camera.main.transform;
        }

        foreach (var entry in assetCatalog)
        {
            if (!string.IsNullOrEmpty(entry.assetId) && entry.prefab != null)
            {
                catalogDict[entry.assetId.ToLower()] = entry.prefab;
            }
        }
    }

    /// <summary>
    /// Envia uma transcrição de voz para o BFF e executa os comandos resultantes.
    /// </summary>
    public void SendVoiceCommand(string transcript)
    {
        StartCoroutine(PostCommandCoroutine(transcript));
    }

    private IEnumerator PostCommandCoroutine(string transcript)
    {
        Vector3 camPos = userCamera != null ? userCamera.position : Vector3.zero;
        float camYaw = userCamera != null ? userCamera.eulerAngles.y : 0f;

        // Montar lista de objetos existentes na cena para memória contextual
        List<ExistingObjectInfo> existingList = new List<ExistingObjectInfo>();
        foreach (var kvp in activeInstances)
        {
            existingList.Add(new ExistingObjectInfo { instance_id = kvp.Key });
        }

        SceneCommandRequest requestData = new SceneCommandRequest
        {
            transcript = transcript,
            user_position = new Vector3Data { x = camPos.x, y = camPos.y, z = camPos.z },
            user_rotation_y = camYaw,
            existing_objects = existingList
        };

        string jsonPayload = JsonUtility.ToJson(requestData);
        string endpoint = bffBaseUrl.TrimEnd('/') + "/api/v1/scene/command";

        using (UnityWebRequest www = new UnityWebRequest(endpoint, "POST"))
        {
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(jsonPayload);
            www.uploadHandler = new UploadHandlerRaw(bodyRaw);
            www.downloadHandler = new DownloadHandlerBuffer();
            www.SetRequestHeader("Content-Type", "application/json");

            yield return www.SendWebRequest();

            if (www.result == UnityWebRequest.Result.Success)
            {
                Debug.Log("[VRSceneManager] Resposta recebida: " + www.downloadHandler.text);
                ProcessResponse(www.downloadHandler.text);
            }
            else
            {
                Debug.LogError("[VRSceneManager] Erro na requisição: " + www.error + " | " + www.downloadHandler.text);
            }
        }
    }

    private void ProcessResponse(string json)
    {
        SceneCommandResponse response = JsonUtility.FromJson<SceneCommandResponse>(json);
        if (response != null && response.commands != null)
        {
            foreach (var cmd in response.commands)
            {
                ExecuteCommand(cmd);
            }
        }
    }

    private void ExecuteCommand(SceneCommand cmd)
    {
        string op = cmd.op.ToLower();
        string instanceId = !string.IsNullOrEmpty(cmd.instance_id) ? cmd.instance_id : "item_" + Guid.NewGuid().ToString().Substring(0, 6);

        switch (op)
        {
            case "spawn":
                SpawnObject(instanceId, cmd.asset_id, cmd.placement, cmd.scale);
                break;

            case "modify":
                ModifyObject(instanceId, cmd.placement, cmd.scale);
                break;

            case "remove":
                RemoveObject(instanceId);
                break;

            case "clear_scene":
                ClearAll();
                break;

            default:
                Debug.LogWarning("[VRSceneManager] Operação não implementada: " + op);
                break;
        }
    }

    private void SpawnObject(string instanceId, string assetId, PlacementData placement, ScaleData scale)
    {
        // Se já existir, remove a versão anterior
        RemoveObject(instanceId);

        GameObject prefab = null;
        if (!string.IsNullOrEmpty(assetId) && catalogDict.TryGetValue(assetId.ToLower(), out GameObject found))
        {
            prefab = found;
        }
        else
        {
            // Fallback para cubo primitivo se não estiver no catálogo
            prefab = GameObject.CreatePrimitive(PrimitiveType.Cube);
        }

        Vector3 targetPos = CalculatePlacement(placement);
        GameObject instance = Instantiate(prefab, targetPos, Quaternion.identity);
        instance.name = instanceId;

        // Ajustar orientação olhando para o usuário
        if (userCamera != null)
        {
            Vector3 lookTarget = new Vector3(userCamera.position.x, targetPos.y, userCamera.position.z);
            instance.transform.LookAt(lookTarget);
        }

        // Ajustar escala
        if (scale != null && scale.value > 0)
        {
            instance.transform.localScale = Vector3.one * scale.value;
        }

        activeInstances[instanceId] = instance;
        Debug.Log($"[VRSceneManager] Instanciado: {instanceId} ({assetId}) em {targetPos}");
    }

    private void ModifyObject(string instanceId, PlacementData placement, ScaleData scale)
    {
        if (activeInstances.TryGetValue(instanceId, out GameObject obj))
        {
            if (scale != null && scale.value > 0)
            {
                if (scale.mode == "multiply")
                    obj.transform.localScale *= scale.value;
                else
                    obj.transform.localScale = Vector3.one * scale.value;
            }

            if (placement != null && !string.IsNullOrEmpty(placement.direction))
            {
                obj.transform.position = CalculatePlacement(placement);
            }

            Debug.Log($"[VRSceneManager] Modificado: {instanceId}");
        }
    }

    private void RemoveObject(string instanceId)
    {
        if (activeInstances.TryGetValue(instanceId, out GameObject obj))
        {
            Destroy(obj);
            activeInstances.Remove(instanceId);
            Debug.Log($"[VRSceneManager] Removido: {instanceId}");
        }
    }

    private void ClearAll()
    {
        foreach (var kvp in activeInstances)
        {
            if (kvp.Value != null) Destroy(kvp.Value);
        }
        activeInstances.Clear();
        Debug.Log("[VRSceneManager] Cena limpa.");
    }

    private Vector3 CalculatePlacement(PlacementData placement)
    {
        if (userCamera == null) return Vector3.forward * 2f;

        float distance = placement != null && placement.distance_m > 0 ? placement.distance_m : 2.5f;
        string dir = placement != null && !string.IsNullOrEmpty(placement.direction) ? placement.direction.ToLower() : "front";
        string vert = placement != null && !string.IsNullOrEmpty(placement.vertical) ? placement.vertical.ToLower() : "ground";

        Vector3 forward = new Vector3(userCamera.forward.x, 0, userCamera.forward.z).normalized;
        Vector3 right = new Vector3(userCamera.right.x, 0, userCamera.right.z).normalized;

        Vector3 offset = Vector3.zero;
        switch (dir)
        {
            case "front":
            case "frente":
                offset = forward * distance;
                break;
            case "back":
            case "tras":
            case "atras":
                offset = -forward * distance;
                break;
            case "left":
            case "esquerda":
                offset = -right * distance;
                break;
            case "right":
            case "direita":
                offset = right * distance;
                break;
            default:
                offset = forward * distance;
                break;
        }

        float yPos = (vert == "eye_level" || vert == "olhos") ? userCamera.position.y : 0f;
        return new Vector3(userCamera.position.x + offset.x, yPos, userCamera.position.z + offset.z);
    }

    // --- Estruturas de Dados para Serialização JSON do Unity ---
    [System.Serializable]
    public class SceneCommandRequest
    {
        public string transcript;
        public Vector3Data user_position;
        public float user_rotation_y;
        public List<ExistingObjectInfo> existing_objects;
    }

    [System.Serializable]
    public class ExistingObjectInfo
    {
        public string instance_id;
    }

    [System.Serializable]
    public class Vector3Data
    {
        public float x;
        public float y;
        public float z;
    }

    [System.Serializable]
    public class SceneCommandResponse
    {
        public string status;
        public List<SceneCommand> commands;
    }

    [System.Serializable]
    public class SceneCommand
    {
        public string op;
        public string instance_id;
        public string asset_id;
        public PlacementData placement;
        public ScaleData scale;
    }

    [System.Serializable]
    public class PlacementData
    {
        public string mode;
        public string direction;
        public float distance_m;
        public string vertical;
    }

    [System.Serializable]
    public class ScaleData
    {
        public string mode;
        public float value;
    }
}
