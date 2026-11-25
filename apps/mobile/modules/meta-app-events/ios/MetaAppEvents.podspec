require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'MetaAppEvents'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'Money2Time'
  s.homepage       = 'https://www.money2time.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/NelsonGan/money2time.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # Core only: app events, SKAdNetwork and AEM. No Login, Share or Gaming kits.
  s.dependency 'FBSDKCoreKit', '~> 19.0'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
