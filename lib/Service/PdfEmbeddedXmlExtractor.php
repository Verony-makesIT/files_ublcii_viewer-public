<?php

declare(strict_types=1);

namespace OCA\FilesUblciiViewer\Service;

use OCP\Files\File;
use OCP\ITempManager;

class PdfEmbeddedXmlExtractor {
	private const PDF_LIMIT = 25_000_000;
	private const XML_LIMIT = 10_000_000;
	private const OUTPUT_LIMIT = 65_536;
	private const ATTACHMENT_LIMIT = 20;
	private const TIMEOUT = 15;
	private const BINARY = '/usr/bin/pdfdetach';
	private const CANDIDATES = ['factur-x.xml', 'zugferd-invoice.xml', 'xrechnung.xml'];

	public function __construct(private ITempManager $tempManager) {
	}

	public function extract(File $file): string {
		if (!function_exists('proc_open') || !is_executable(self::BINARY)) {
			throw new PdfExtractionException('extraction_unavailable', 'PDF extraction is unavailable. Ask the server administrator to enable PHP process execution and install Poppler. On Ubuntu/Debian: sudo apt install poppler-utils (not a universal Linux command).', 503);
		}
		if (!$file->isReadable()) {
			throw new PdfExtractionException('file_unreadable', 'The selected file could not be read.', 404);
		}
		if ($file->getSize() > self::PDF_LIMIT) {
			throw new PdfExtractionException('pdf_too_large', 'The PDF exceeds the 25 MB limit.', 413);
		}
		$directory = $this->tempManager->getTemporaryFolder('ublcii-pdf');
		if (!$directory) {
			throw new PdfExtractionException('extraction_failed', 'PDF extraction could not be completed.', 500);
		}
		$pdf = $directory . '/input.pdf';
		$xml = $directory . '/invoice.xml';
		$input = $output = null;
		try {
			if (!@chmod($directory, 0700)) {
				throw new \RuntimeException('Private temporary directory unavailable');
			}
			$input = $file->fopen('r');
			$output = @fopen($pdf, 'xb');
			if (!is_resource($input) || !is_resource($output) || !@chmod($pdf, 0600)) {
				throw new PdfExtractionException('file_unreadable', 'The selected file could not be read.', 404);
			}
			$bytes = @stream_copy_to_stream($input, $output, self::PDF_LIMIT + 1);
			if ($bytes === false) {
				throw new PdfExtractionException('file_unreadable', 'The selected file could not be read.', 404);
			}
			if ($bytes > self::PDF_LIMIT) {
				throw new PdfExtractionException('pdf_too_large', 'The PDF exceeds the 25 MB limit.', 413);
			}
			fclose($input);
			$input = null;
			fclose($output);
			$output = null;
			$deadline = microtime(true) + self::TIMEOUT;
			$listing = $this->run(['-list', '-enc', 'UTF-8', $pdf], $deadline);
			$number = $this->selectAttachment($listing);
			$this->run(['-save', (string)$number, '-o', $xml, $pdf], $deadline, $xml);
			clearstatcache(true, $xml);
			if (!is_file($xml) || is_link($xml) || filesize($xml) === 0) {
				throw new PdfExtractionException('extraction_empty', 'The embedded XML could not be extracted or is empty.');
			}
			if (filesize($xml) > self::XML_LIMIT) {
				throw new PdfExtractionException('xml_too_large', 'The embedded XML exceeds the 10 MB limit.', 413);
			}
			if (!@chmod($xml, 0600)) {
				throw new \RuntimeException('Private temporary XML unavailable');
			}
			$content = @file_get_contents($xml, false, null, 0, self::XML_LIMIT + 1);
			if ($content === false || $content === '') {
				throw new PdfExtractionException('extraction_empty', 'The embedded XML could not be extracted or is empty.');
			}
			if (strlen($content) > self::XML_LIMIT) {
				throw new PdfExtractionException('xml_too_large', 'The embedded XML exceeds the 10 MB limit.', 413);
			}
			$this->checkXmlSafety($content);
			return $content;
		} finally {
			if (is_resource($input)) fclose($input);
			if (is_resource($output)) fclose($output);
			if (is_file($xml)) @unlink($xml);
			if (is_file($pdf)) @unlink($pdf);
			if (is_dir($directory)) @rmdir($directory);
		}
	}

	private function selectAttachment(string $listing): int {
		$lines = preg_split('/\r?\n/', rtrim($listing, "\r\n"));
		if (!preg_match('/^(\d+) embedded files$/D', array_shift($lines) ?? '', $match)) {
			throw new PdfExtractionException('inventory_invalid', 'The PDF attachment list could not be read.');
		}
		$count = (int)$match[1];
		if ($count > self::ATTACHMENT_LIMIT) {
			throw new PdfExtractionException('too_many_attachments', 'The PDF contains more than 20 embedded files.');
		}
		if ($count === 0) {
			throw new PdfExtractionException('no_attachments', 'The PDF contains no embedded files.');
		}
		if (count($lines) !== $count) {
			throw new PdfExtractionException('inventory_invalid', 'The PDF attachment list could not be read.');
		}
		$candidates = [];
		foreach ($lines as $index => $line) {
			if (!preg_match('/^(\d+): ([^\x00-\x1f\x7f]+)$/D', $line, $entry) || (int)$entry[1] !== $index + 1) {
				throw new PdfExtractionException('inventory_invalid', 'The PDF attachment list could not be read.');
			}
			if (in_array(strtolower($entry[2]), self::CANDIDATES, true)) $candidates[] = $index + 1;
		}
		if (!$candidates) throw new PdfExtractionException('no_candidate', 'No supported invoice XML was found in the PDF.');
		if (count($candidates) !== 1) throw new PdfExtractionException('ambiguous_candidates', 'The PDF contains multiple invoice XML candidates.');
		return $candidates[0];
	}

	private function run(array $arguments, float $deadline, ?string $outputFile = null): string {
		$pipes = [];
		$process = @proc_open(array_merge([self::BINARY], $arguments), [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['LC_ALL' => 'C', 'LANG' => 'C']);
		if (!is_resource($process)) throw new PdfExtractionException('extraction_unavailable', 'PDF extraction is unavailable. Ask the server administrator to check PHP process execution.', 503);
		$stdout = '';
		$total = 0;
		$exitCode = null;
		try {
			fclose($pipes[0]);
			unset($pipes[0]);
			foreach ($pipes as $pipe) stream_set_blocking($pipe, false);
			do {
				if (microtime(true) >= $deadline) throw new PdfExtractionException('extraction_timeout', 'PDF extraction exceeded the 15 second limit.', 504);
				$status = proc_get_status($process);
				if (!$status['running'] && $exitCode === null) $exitCode = $status['exitcode'];
				foreach ($pipes as $index => $pipe) {
					$chunk = fread($pipe, 8192);
					if ($chunk === false) throw new PdfExtractionException('extraction_failed', 'PDF extraction could not be completed.');
					$total += strlen($chunk);
					if ($total > self::OUTPUT_LIMIT) throw new PdfExtractionException('process_output_limit', 'PDF extraction produced excessive diagnostic output.');
					if ($index === 1) $stdout .= $chunk;
				}
				if ($outputFile !== null) {
					clearstatcache(true, $outputFile);
					if (is_file($outputFile) && filesize($outputFile) > self::XML_LIMIT) throw new PdfExtractionException('xml_too_large', 'The embedded XML exceeds the 10 MB limit.', 413);
				}
				$drained = feof($pipes[1]) && feof($pipes[2]);
				if ($status['running'] || !$drained) usleep(10000);
			} while ($status['running'] || !$drained);
			if ($exitCode !== 0) {
				throw new PdfExtractionException($outputFile === null ? 'pdf_unreadable' : 'extraction_failed', $outputFile === null ? 'The PDF is corrupt, protected or unreadable.' : 'The embedded XML could not be extracted.');
			}
			return $stdout;
		} finally {
			if (proc_get_status($process)['running']) proc_terminate($process, 9);
			foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
			proc_close($process);
		}
	}

	private function checkXmlSafety(string $content): void {
		// Do not resolve entities, fetch DTDs, substitute entities or process XInclude.
		$previous = libxml_use_internal_errors(true);
		try {
			$document = new \DOMDocument();
			$document->resolveExternals = false;
			$document->substituteEntities = false;
			$valid = $document->loadXML($content, LIBXML_NONET);
			if ($document->doctype !== null || ($valid && $document->getElementsByTagNameNS('http://www.w3.org/2001/XInclude', '*')->length > 0)) {
				throw new PdfExtractionException('unsafe_xml', 'Embedded XML with a DTD or XInclude is not supported.');
			}
			// Malformed XML is returned unchanged for the existing frontend error handling.
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors($previous);
		}
	}
}
