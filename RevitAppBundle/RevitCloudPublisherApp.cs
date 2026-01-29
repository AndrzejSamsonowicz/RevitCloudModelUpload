using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using DesignAutomationFramework;
using Newtonsoft.Json;
using System;
using System.IO;

namespace RevitCloudPublisher
{
    /// <summary>
    /// Input parameters for cloud model access (matching official APS sample)
    /// </summary>
    public class InputParams
    {
        public string Region { get; set; } = "US";
        
        [JsonProperty(PropertyName = "ProjectGuid", Required = Required.Default)]
        public Guid ProjectGuid { get; set; }
        
        [JsonProperty(PropertyName = "ModelGuid", Required = Required.Default)]
        public Guid ModelGuid { get; set; }

        public static InputParams Parse(string jsonPath)
        {
            try
            {
                string jsonContents = File.ReadAllText(jsonPath);
                InputParams result = JsonConvert.DeserializeObject<InputParams>(jsonContents);
                Console.WriteLine($"Parsed JSON: Region={result.Region}, ProjectGuid={result.ProjectGuid}, ModelGuid={result.ModelGuid}");
                return result;
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to parse input JSON from {jsonPath}: {ex.Message}");
            }
        }
    }

    [Autodesk.Revit.Attributes.Regeneration(Autodesk.Revit.Attributes.RegenerationOption.Manual)]
    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    public class RevitCloudPublisherApp : IExternalDBApplication
    {
        public ExternalDBApplicationResult OnStartup(ControlledApplication application)
        {
            DesignAutomationBridge.DesignAutomationReadyEvent += HandleDesignAutomationReadyEvent;
            return ExternalDBApplicationResult.Succeeded;
        }

        public ExternalDBApplicationResult OnShutdown(ControlledApplication application)
        {
            return ExternalDBApplicationResult.Succeeded;
        }

        private void HandleDesignAutomationReadyEvent(object sender, DesignAutomationReadyEventArgs e)
        {
            e.Succeeded = ProcessCloudModel(e.DesignAutomationData);
        }

        private bool ProcessCloudModel(DesignAutomationData data)
        {
            if (data == null)
            {
                LogTrace("ERROR: DesignAutomationData is null");
                return false;
            }

            Application rvtApp = data.RevitApp;
            if (rvtApp == null)
            {
                LogTrace("ERROR: RevitApp is null");
                return false;
            }

            try
            {
                // Parse input JSON parameters (matching official sample)
                LogTrace("Parsing input parameters from params.json");
                InputParams inputParams = InputParams.Parse("params.json");
                if (inputParams == null)
                {
                    LogTrace("ERROR: Failed to parse input parameters");
                    return false;
                }

                LogTrace($"Got input JSON successfully - Region: {inputParams.Region}, ProjectGuid: {inputParams.ProjectGuid}, ModelGuid: {inputParams.ModelGuid}");

                // Build cloud model path from GUIDs (matching official sample)
                string region = inputParams.Region == "US" ? ModelPathUtils.CloudRegionUS : 
                               inputParams.Region == "EMEA" ? ModelPathUtils.CloudRegionEMEA : 
                               ModelPathUtils.CloudRegionUS;
                
                ModelPath cloudModelPath = ModelPathUtils.ConvertCloudGUIDsToCloudPath(
                    region, 
                    inputParams.ProjectGuid, 
                    inputParams.ModelGuid);

                LogTrace("Registering failure handling...");
                rvtApp.FailuresProcessing += OnFailuresProcessing;
                
                // Open the cloud model (matching official sample)
                LogTrace("Opening Revit Cloud Model...");
                Document doc = rvtApp.OpenDocumentFile(cloudModelPath, new OpenOptions());
                if (doc == null)
                {
                    LogTrace("ERROR: Failed to open Revit Cloud Model");
                    return false;
                }

                LogTrace($"Revit Cloud Model opened successfully!");
                LogTrace($"Document Title: {doc.Title}");
                LogTrace($"Is Workshared: {doc.IsWorkshared}");
                LogTrace($"Is Cloud Model: {doc.IsModelInCloud}");

                // Count elements
                FilteredElementCollector collector = new FilteredElementCollector(doc);
                int elementCount = collector.WhereElementIsNotElementType().ToElements().Count;
                LogTrace($"Total elements in model: {elementCount}");

                // Publish changes based on model type (per Autodesk documentation)
                if (doc.IsWorkshared)
                {
                    LogTrace("Synchronizing with central (work-shared cloud model)...");
                    
                    SynchronizeWithCentralOptions swc = new SynchronizeWithCentralOptions();
                    swc.SetRelinquishOptions(new RelinquishOptions(true));
                    swc.Comment = "Automated publish via Design Automation";
                    
                    TransactWithCentralOptions twc = new TransactWithCentralOptions();
                    doc.SynchronizeWithCentral(twc, swc);
                    LogTrace("***Work-shared cloud model synchronized to central!***");
                }
                else
                {
                    // Single user cloud model - SaveCloudModel saves directly to cloud
                    LogTrace("Saving single-user cloud model...");
                    doc.SaveCloudModel();
                    LogTrace("***Single-user cloud model saved to cloud!***");
                }

                // Write result file
                WriteResultFile("SUCCESS", $"Model processed successfully. Element count: {elementCount}");

                LogTrace("Cloud model processing completed successfully");
                return true;
            }
            catch (Exception ex)
            {
                LogTrace($"ERROR: Exception during cloud model processing: {ex.Message}");
                LogTrace($"Stack trace: {ex.StackTrace}");
                
                if (ex.InnerException != null)
                {
                    LogTrace($"Inner exception: {ex.InnerException.Message}");
                }
                
                WriteResultFile("FAILED", ex.Message);
                return false;
            }
        }

        private void OnFailuresProcessing(object sender, FailuresProcessingEventArgs e)
        {
            FailuresAccessor failuresAccessor = e.GetFailuresAccessor();
            var failureMessages = failuresAccessor.GetFailureMessages();
            
            foreach (FailureMessageAccessor failure in failureMessages)
            {
                LogTrace($"Failure: {failure.GetDescriptionText()}");
                
                // Attempt to resolve failures
                FailureSeverity severity = failure.GetSeverity();
                if (severity == FailureSeverity.Warning)
                {
                    failuresAccessor.DeleteWarning(failure);
                }
                else
                {
                    // For errors, try to resolve
                    failuresAccessor.ResolveFailure(failure);
                }
            }
            
            e.SetProcessingResult(FailureProcessingResult.Continue);
        }

        private void LogTrace(string message)
        {
            Console.WriteLine($"[RevitCloudPublisher] {DateTime.Now:yyyy-MM-dd HH:mm:ss} - {message}");
            System.Diagnostics.Trace.WriteLine($"[RevitCloudPublisher] {message}");
        }

        private void WriteResultFile(string status, string message)
        {
            try
            {
                string resultPath = Path.Combine(Directory.GetCurrentDirectory(), "result.txt");
                string content = $"Status: {status}\nMessage: {message}\nTimestamp: {DateTime.UtcNow:o}";
                File.WriteAllText(resultPath, content);
                LogTrace($"Result file written: {resultPath}");
                LogTrace($"Content: {content}");
            }
            catch (Exception ex)
            {
                LogTrace($"ERROR: Failed to write result file: {ex.Message}");
            }
        }
    }
}
