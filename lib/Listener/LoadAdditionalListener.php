<?php

declare(strict_types=1);

namespace OCA\FilesUblciiViewer\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\FilesUblciiViewer\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

class LoadAdditionalListener implements IEventListener
{
	public function handle(Event $event): void
	{
		if (!($event instanceof LoadAdditionalScriptsEvent)) {
			return;
		}

		Util::addScript(
			Application::APP_ID,
			'files_ublcii_viewer-main',
			'files'
		);

		Util::addStyle(
			Application::APP_ID,
			'viewer'
		);
	}
}
