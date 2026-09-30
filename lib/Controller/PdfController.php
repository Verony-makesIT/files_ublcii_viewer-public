<?php

declare(strict_types=1);

namespace OCA\FilesUblciiViewer\Controller;

use OCA\FilesUblciiViewer\Service\PdfEmbeddedXmlExtractor;
use OCA\FilesUblciiViewer\Service\PdfExtractionException;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;

class PdfController extends Controller {
	public function __construct(IRequest $request, private IUserSession $userSession, private IRootFolder $rootFolder, private PdfEmbeddedXmlExtractor $extractor) {
		parent::__construct('files_ublcii_viewer', $request);
	}

	#[NoAdminRequired]
	public function extract(string $fileId): DataDisplayResponse|JSONResponse {
		$headers = ['Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff'];
		try {
			$user = $this->userSession->getUser();
			if ($user === null || !preg_match('/^[1-9][0-9]*$/D', $fileId) || (string)(int)$fileId !== $fileId) {
				throw new PdfExtractionException('file_unreadable', 'The selected file could not be read.', 404);
			}
			// Resolve exclusively inside the authenticated user's accessible file tree.
			$nodes = $this->rootFolder->getUserFolder($user->getUID())->getById((int)$fileId);
			foreach ($nodes as $node) {
				if ($node instanceof File && $node->isReadable()) {
					return new DataDisplayResponse($this->extractor->extract($node), 200, $headers + ['Content-Type' => 'application/xml']);
				}
			}
			throw new PdfExtractionException('file_unreadable', 'The selected file could not be read.', 404);
		} catch (PdfExtractionException $error) {
			return new JSONResponse(['code' => $error->errorCode, 'message' => $error->getMessage()], $error->status, $headers);
		} catch (\OCP\Files\NotFoundException | \OCP\Files\NotPermittedException $error) {
			return new JSONResponse(['code' => 'file_unreadable', 'message' => 'The selected file could not be read.'], 404, $headers);
		} catch (\Throwable $error) {
			return new JSONResponse(['code' => 'extraction_failed', 'message' => 'The selected file could not be read or extracted.'], 500, $headers);
		}
	}
}
