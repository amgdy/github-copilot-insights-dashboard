targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment for Azure Developer CLI')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('Name of the resource group')
param resourceGroupName string = 'rg-${environmentName}'

@description('PostgreSQL administrator username')
param postgresAdminUser string = 'pgadmin'

@secure()
@description('(Optional) GitHub PAT — can also be configured via the Settings page in the app. Required scopes: manage_billing:copilot (read) or manage_billing:enterprise (read). Generate at https://github.com/settings/tokens')
param githubToken string = ''

@secure()
@minLength(8)
@maxLength(128)
@description('Copilot Insights Dashboard admin password. Used to protect access to the application Settings page. Must be at least 8 characters.')
param adminPassword string

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    'azd-env-name': environmentName
  }
}

module resources 'resources.bicep' = {
  name: 'resources-deployment'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    postgresAdminUser: postgresAdminUser
    githubToken: githubToken
    hasGitHubToken: !empty(githubToken)
    adminPassword: adminPassword
  }
}

output RESOURCE_GROUP_ID string = rg.id
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryEndpoint
output WEB_URI string = resources.outputs.webUri
