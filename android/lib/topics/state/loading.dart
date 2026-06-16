import 'package:flutter/material.dart';

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({super.key, this.progress});
  final double? progress;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SizedBox(
        width: MediaQuery.of(context).size.width,
        child: Center(
          child: CircularProgressIndicator(
            value: progress == 0 ? null : progress,
          ),
        ),
      ),
    );
  }
}
